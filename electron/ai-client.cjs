'use strict'
// 模型请求通道。与更新检查的公网白名单（guardPublicHttps）刻意分开：
// 这条通道要允许本机/内网的 ollama、LM Studio、企业内网网关，所以按"用户自己填的地址"对待，
// 只锁协议、超时、响应体上限和跨源重定向四件事。

const AI_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const ANTHROPIC_VERSION = '2023-06-01'

/** 端点拼接：OpenAI 以 /chat/completions 结尾；Anthropic 以 /v1/messages 结尾，且 base 已带 /v1 时不重复 */
function endpointFor(protocol, baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  if (protocol === 'anthropic') {
    if (/\/v1$/.test(base)) return `${base}/messages`
    return `${base}/v1/messages`
  }
  if (/\/chat\/completions$/.test(base)) return base
  if (/\/v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

function buildChatRequest({ protocol, baseUrl, key, model, prompt, maxTokens }) {
  const url = endpointFor(protocol, baseUrl)
  const body =
    protocol === 'anthropic'
      ? {
          model,
          max_tokens: maxTokens || 1024,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        }
      : {
          model,
          max_tokens: maxTokens || 1024,
          temperature: 0.2,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (key) {
    if (protocol === 'anthropic') {
      headers['x-api-key'] = key
      headers['anthropic-version'] = ANTHROPIC_VERSION
    } else {
      headers.Authorization = `Bearer ${key}`
    }
  }
  return { url, method: 'POST', headers, body, protocol }
}

/** 各家错误体形状不一：先取常见字段，再退化为纯文本前 200 字，不编造"请稍后重试" */
function extractError(status, rawText) {
  let detail = ''
  try {
    const parsed = JSON.parse(rawText)
    detail =
      parsed?.error?.message ||
      parsed?.message ||
      (typeof parsed?.error === 'string' ? parsed.error : '') ||
      ''
  } catch {
    detail = String(rawText || '')
  }
  detail = String(detail).replace(/\s+/g, ' ').trim().slice(0, 200)
  return `HTTP ${status}${detail ? ` · ${detail}` : ''}`
}

function parseChatResponse(protocol, payload) {
  if (protocol === 'anthropic') {
    const blocks = Array.isArray(payload?.content) ? payload.content : []
    const text = blocks
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return text || null
  }
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null
  const text = choice?.message?.content ?? choice?.text
  if (typeof text === 'string' && text.trim()) return text.trim()
  return null
}

const SECRET_PATTERNS = [
  // OpenAI / Anthropic 风格密钥
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[已脱敏密钥]'],
  [/\bgh[pousr]_[A-Za-z0-9]{8,}\b/g, '[已脱敏令牌]'],
  [/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, '[已脱敏令牌]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, '[已脱敏令牌]'],
  // JWT
  // JWT：签名段可能为空（两段式 bearer），只要头是 eyJ 且带一个点就按令牌处理
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*)?\b/g, '[已脱敏令牌]'],
  // Authorization 头整行
  [/\b(authorization|x-api-key|api[-_]?key)\s*[:=]\s*\S+/gi, '$1: [已脱敏]'],
  // 私钥块
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[已脱敏私钥]'],
  // 内网 IPv4（含可选端口）
  [
    /\b(?:127|10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?::\d{2,5})?\b/g,
    '[内网地址]',
  ],
]

function redactSecrets(text) {
  let out = String(text ?? '')
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * 真正发请求。netImpl 注入是为了让单测不需要 Electron；跨源重定向一律不跟，
 * 同源重定向最多跟一次（Chromium 默认会自动跟，所以这里显式接管 redirect 事件）。
 */
function requestChat({ netImpl, request, timeoutMs = AI_TIMEOUT_MS, onAbortRegister }) {
  const net = netImpl || require('electron').net
  return new Promise((resolve) => {
    let settled = false
    let bytes = 0
    const chunks = []
    const origin = (() => {
      try {
        return new URL(request.url).origin
      } catch {
        return ''
      }
    })()

    const handle = net.request({ method: request.method, url: request.url })
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        handle.abort()
      } catch {
        /* 已结束 */
      }
      finish({ ok: false, message: `${Math.round(timeoutMs / 1000)} 秒未响应，已断开连接` })
    }, timeoutMs)

    if (onAbortRegister) {
      onAbortRegister(() => {
        try {
          handle.abort()
        } catch {
          /* 已结束 */
        }
        finish({ ok: false, canceled: true, message: '已取消' })
      })
    }

    for (const [name, value] of Object.entries(request.headers)) {
      handle.setHeader(name, value)
    }

    let redirectedOnce = false
    handle.on('redirect', (statusCode, method, redirectUrl) => {
      let nextOrigin = ''
      try {
        nextOrigin = new URL(redirectUrl).origin
      } catch {
        nextOrigin = ''
      }
      if (nextOrigin !== origin || redirectedOnce) {
        try {
          handle.abort()
        } catch {
          /* 已结束 */
        }
        finish({
          ok: false,
          message: `地址被重定向到 ${nextOrigin || '未知来源'}，出于安全没有跟随`,
        })
        return
      }
      redirectedOnce = true
      handle.followRedirect()
    })

    handle.on('response', (response) => {
      const status = response.statusCode
      response.on('data', (data) => {
        bytes += data.length
        if (bytes > MAX_RESPONSE_BYTES) {
          try {
            handle.abort()
          } catch {
            /* 已结束 */
          }
          finish({ ok: false, message: '响应超过 2 MB 上限，已中断' })
          return
        }
        chunks.push(data)
      })
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (status < 200 || status >= 300) {
          finish({ ok: false, message: extractError(status, text) })
          return
        }
        let payload
        try {
          payload = JSON.parse(text)
        } catch {
          finish({ ok: false, message: `响应不是合法 JSON（${text.slice(0, 120)}）` })
          return
        }
        const content = parseChatResponse(request.protocol, payload)
        if (!content) {
          finish({ ok: false, message: '模型返回了空内容' })
          return
        }
        finish({ ok: true, text: content, status })
      })
      response.on('error', () => finish({ ok: false, message: '读取响应失败' }))
    })

    handle.on('error', (error) => {
      const code = String(error?.message || error || '')
      if (settled) return
      finish({
        ok: false,
        message: code.includes('ERR_ABORTED') ? '已取消' : `连接失败：${code.slice(0, 120)}`,
      })
    })

    handle.end(JSON.stringify(request.body))
  })
}

module.exports = {
  AI_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  ANTHROPIC_VERSION,
  endpointFor,
  buildChatRequest,
  parseChatResponse,
  extractError,
  redactSecrets,
  requestChat,
}
