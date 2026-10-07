import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
interface AiClientModule {
  endpointFor: (protocol: string, baseUrl: string) => string
  buildChatRequest: (input: {
    protocol: string
    baseUrl: string
    key: string
    model: string
    prompt: { system: string; user: string }
    maxTokens?: number
  }) => {
    url: string
    method: string
    headers: Record<string, string>
    body: {
      model: string
      max_tokens: number
      temperature?: number
      system?: string
      messages: Array<{ role: string; content: string }>
    }
  }
  parseChatResponse: (protocol: string, payload: unknown) => string | null
  extractError: (status: number, rawText: string) => string
  redactSecrets: (text: string) => string
}

const { endpointFor, buildChatRequest, parseChatResponse, extractError, redactSecrets } =
  require('../electron/ai-client.cjs') as AiClientModule

describe('endpointFor', () => {
  it('OpenAI：裸域名补 /v1/chat/completions', () => {
    expect(endpointFor('openai', 'https://api.openai.com')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
  })
  it('OpenAI：已带 /v1 不重复补', () => {
    expect(endpointFor('openai', 'https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
  })
  it('OpenAI：已带完整端点原样用', () => {
    expect(endpointFor('openai', 'https://x.example/v1/chat/completions')).toBe(
      'https://x.example/v1/chat/completions',
    )
  })
  it('OpenAI：本机 ollama / 内网网关', () => {
    expect(endpointFor('openai', 'http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    )
    expect(endpointFor('openai', 'http://192.168.1.20:8000')).toBe(
      'http://192.168.1.20:8000/v1/chat/completions',
    )
  })
  it('Anthropic：默认补 /v1/messages，base 已带 /v1 时不重复', () => {
    expect(endpointFor('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages',
    )
    expect(endpointFor('anthropic', 'https://gw.internal/v1')).toBe(
      'https://gw.internal/v1/messages',
    )
  })
  it('尾斜杠不影响结果', () => {
    expect(endpointFor('openai', 'https://api.openai.com/v1/')).toBe(
      endpointFor('openai', 'https://api.openai.com/v1'),
    )
  })
})

describe('buildChatRequest', () => {
  const prompt = { system: 'SYS', user: 'USER' }
  it('OpenAI 用 Bearer 头 + system/user 两条消息', () => {
    const r = buildChatRequest({
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      key: 'sk-abcdef123456',
      model: 'gpt-5',
      prompt,
    })
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(r.method).toBe('POST')
    expect(r.headers.Authorization).toBe('Bearer sk-abcdef123456')
    expect(r.headers['x-api-key']).toBeUndefined()
    expect(r.body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
    expect(r.body.model).toBe('gpt-5')
  })
  it('Anthropic 用 x-api-key + anthropic-version，system 独立字段', () => {
    const r = buildChatRequest({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      key: 'sk-ant-abcdef123456',
      model: 'claude-x',
      prompt,
    })
    expect(r.headers['x-api-key']).toBe('sk-ant-abcdef123456')
    expect(r.headers.Authorization).toBeUndefined()
    expect(r.headers['anthropic-version']).toBeTruthy()
    expect(r.body.system).toBe('SYS')
    expect(r.body.messages).toHaveLength(1)
    expect(r.body.max_tokens).toBeTruthy()
  })
  it('无密钥（本机 ollama）不带鉴权头', () => {
    const r = buildChatRequest({
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      key: '',
      model: 'qwen3',
      prompt,
    })
    expect(r.headers.Authorization).toBeUndefined()
    expect(r.headers['x-api-key']).toBeUndefined()
  })
})

describe('parseChatResponse', () => {
  it('OpenAI 取 choices[0].message.content', () => {
    expect(parseChatResponse('openai', { choices: [{ message: { content: ' 结果 ' } }] })).toBe(
      '结果',
    )
  })
  it('Anthropic 拼接多个 text block', () => {
    expect(
      parseChatResponse('anthropic', {
        content: [
          { type: 'text', text: 'A' },
          { type: 'thinking', text: 'skip' },
          { type: 'text', text: 'B' },
        ],
      }),
    ).toBe('A\nB')
  })
  it('空内容返回 null（上层据此报"模型返回了空内容"）', () => {
    expect(parseChatResponse('openai', { choices: [{ message: { content: '   ' } }] })).toBeNull()
    expect(parseChatResponse('anthropic', {})).toBeNull()
    expect(parseChatResponse('openai', null)).toBeNull()
  })
})

describe('extractError', () => {
  it('OpenAI 风格 error.message', () => {
    expect(extractError(401, JSON.stringify({ error: { message: 'Incorrect API key' } }))).toBe(
      'HTTP 401 · Incorrect API key',
    )
  })
  it('Anthropic 风格 {type:error,error:{type,message}}', () => {
    expect(
      extractError(
        400,
        JSON.stringify({ type: 'error', error: { type: 'invalid_request', message: 'bad' } }),
      ),
    ).toBe('HTTP 400 · bad')
  })
  it('非 JSON 的 HTML 错误页只取纯文本前 200 字', () => {
    const long = '<html><body>Bad Gateway ' + 'x'.repeat(400) + '</body></html>'
    const msg = extractError(502, long)
    expect(msg.startsWith('HTTP 502 ·')).toBe(true)
    expect(msg.length).toBeLessThanOrEqual('HTTP 502 · '.length + 200)
  })
  it('空响应体也不炸', () => {
    expect(extractError(500, '')).toBe('HTTP 500')
  })
})

describe('redactSecrets', () => {
  it('逐类命中', () => {
    const cases: Array<[string, string]> = [
      ['我的 key 是 sk-abcd1234EFGH5678 谢谢', '[已脱敏密钥]'],
      ['token ghp_AbCdEf1234567890abc', '[已脱敏令牌]'],
      ['github_pat_11ABCDEFG_abcdefghijklmnopqrst', '[已脱敏令牌]'],
      ['slack xoxb-123456789012-abcdefghij', '[已脱敏令牌]'],
      [
        'jwt eyJhbGciOiJIUzI1NiIsInR5cCI6eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123_456ghi',
        '[已脱敏令牌]',
      ],
      ['Authorization: Bearer abcdef123456', '[已脱敏]'],
      ['-----BEGIN RSA PRIVATE KEY-----\nMIIBVw\n-----END RSA PRIVATE KEY-----', '[已脱敏私钥]'],
      ['请求 http://192.168.1.25:11434 超时', '[内网地址]'],
      ['本机 127.0.0.1:8080 正常', '[内网地址]'],
    ]
    for (const [input, mustContain] of cases) {
      const out = redactSecrets(input)
      expect(out, input).not.toMatch(
        /sk-[A-Za-z0-9_-]{8,}|ghp_|github_pat_|xoxb-|eyJ[A-Za-z0-9_-]{8,}\./,
      )
      expect(out).toContain(mustContain)
    }
  })

  it('不误伤正常中文与英文句子', () => {
    const plain = '重构了下载页的 CSP 配置，build 通过，10 月 7 日完成。'
    expect(redactSecrets(plain)).toBe(plain)
    const english = 'The API returns 200 OK after retry.'
    expect(redactSecrets(english)).toBe(english)
  })

  it('端口与版本号不被当成内网 IP', () => {
    expect(redactSecrets('v1.2.3 已发布')).toBe('v1.2.3 已发布')
  })
})
