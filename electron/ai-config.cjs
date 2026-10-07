'use strict'
// 模型通道的配置与密钥存储。
// 设计约束：密钥只在本进程以 safeStorage 加密后落盘，渲染进程拿到的永远是 hasKey；
// 系统钥匙串不可用时直接拒绝保存密钥，不退化成明文（这个软件是公开仓库，宁可少个功能）。

const CONFIG_VERSION = 1
const PROTOCOLS = ['openai', 'anthropic']
const MAX_CHANNELS = 12
const NAME_MAX = 40
const MODEL_MAX = 120

function normalizeBaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, message: 'Base URL 不能为空' }
  let candidate = raw.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = 'https://' + candidate
  let url
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, message: 'Base URL 无法解析' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: '只支持 http / https 地址' }
  }
  if (url.username || url.password) return { ok: false, message: 'Base URL 里不要带账号密码' }
  if (url.search) return { ok: false, message: 'Base URL 不要带查询参数' }
  if (url.hash) return { ok: false, message: 'Base URL 不要带锚点' }
  if (!url.hostname) return { ok: false, message: 'Base URL 缺少主机名' }
  return { ok: true, value: url.origin + url.pathname.replace(/\/+$/, '') }
}

function clip(value, max) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function validateChannel(input) {
  const name = clip(input?.name, NAME_MAX)
  if (!name) return { ok: false, message: '名称不能为空' }
  if (!PROTOCOLS.includes(input?.protocol)) {
    return { ok: false, message: `协议只支持 ${PROTOCOLS.join(' / ')}` }
  }
  const model = clip(input?.model, MODEL_MAX)
  if (!model) return { ok: false, message: '模型名不能为空' }
  const base = normalizeBaseUrl(input?.baseUrl)
  if (!base.ok) return { ok: false, message: base.message }
  return { ok: true, value: { name, protocol: input.protocol, model, baseUrl: base.value } }
}

function publicChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    protocol: channel.protocol,
    baseUrl: channel.baseUrl,
    model: channel.model,
    hasKey: !!channel.keyEnc,
  }
}

function createAiConfigStore(options) {
  const { file, crypto, fsImpl = require('node:fs'), idFactory } = options
  let counter = 0
  const makeId =
    idFactory ||
    (() => {
      counter += 1
      return `ch_${Date.now().toString(36)}_${counter}`
    })

  function load() {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8'))
      const channels = Array.isArray(parsed?.channels) ? parsed.channels : []
      return {
        version: CONFIG_VERSION,
        activeId: typeof parsed?.activeId === 'string' ? parsed.activeId : null,
        channels: channels.filter((c) => c && typeof c.id === 'string').slice(0, MAX_CHANNELS),
      }
    } catch {
      return { version: CONFIG_VERSION, activeId: null, channels: [] }
    }
  }

  function save(config) {
    fsImpl.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8')
    return config
  }

  function state() {
    const config = load()
    return {
      ok: true,
      activeId: config.channels.some((c) => c.id === config.activeId) ? config.activeId : null,
      channels: config.channels.map(publicChannel),
      keyStorage: crypto ? 'available' : 'unavailable',
    }
  }

  /** key 传 undefined = 保留原密钥；传空串 = 清除；传非空 = 覆盖（需钥匙串可用） */
  function upsert(input) {
    const checked = validateChannel(input)
    if (!checked.ok) return checked
    const config = load()
    const index = config.channels.findIndex((c) => c.id === input.id)
    const existing = index >= 0 ? config.channels[index] : null
    if (!existing && config.channels.length >= MAX_CHANNELS) {
      return { ok: false, message: `最多保存 ${MAX_CHANNELS} 个通道` }
    }

    let keyEnc = existing ? existing.keyEnc : null
    if (typeof input.key === 'string') {
      const trimmed = input.key.trim()
      if (trimmed === '') {
        keyEnc = null
      } else {
        if (!crypto) {
          return {
            ok: false,
            message: '本机系统钥匙串不可用，无法安全保存 API 密钥；请先修复系统密钥串后重试。',
          }
        }
        try {
          keyEnc = crypto.encrypt(trimmed)
        } catch {
          return { ok: false, message: '密钥加密失败，未保存。' }
        }
        if (typeof keyEnc !== 'string' || !keyEnc) {
          return { ok: false, message: '密钥加密失败，未保存。' }
        }
      }
    }

    const record = { ...checked.value, id: existing ? existing.id : makeId(), keyEnc }
    if (existing) config.channels[index] = record
    else config.channels.push(record)
    if (!config.activeId) config.activeId = record.id
    save(config)
    return { ok: true, channel: publicChannel(record), activeId: config.activeId }
  }

  function remove(id) {
    const config = load()
    const next = config.channels.filter((c) => c.id !== id)
    if (next.length === config.channels.length) return { ok: false, message: '通道不存在' }
    config.channels = next
    if (config.activeId === id) config.activeId = next.length ? next[0].id : null
    save(config)
    return { ok: true, activeId: config.activeId, channels: next.map(publicChannel) }
  }

  function setActive(id) {
    const config = load()
    if (!config.channels.some((c) => c.id === id)) return { ok: false, message: '通道不存在' }
    config.activeId = id
    save(config)
    return { ok: true, activeId: id }
  }

  /** 取出可用于发请求的通道（含明文密钥），只在主进程内部使用，不经 IPC 回传 */
  function resolveForRequest(id) {
    const config = load()
    const targetId = id || config.activeId
    const channel = config.channels.find((c) => c.id === targetId)
    if (!channel) return { ok: false, message: '还没有配置模型通道' }
    if (!channel.keyEnc) return { ok: true, channel: { ...channel, key: '' } }
    if (!crypto) return { ok: false, message: '系统钥匙串不可用，读不出已保存的密钥' }
    try {
      return { ok: true, channel: { ...channel, key: crypto.decrypt(channel.keyEnc) } }
    } catch {
      return { ok: false, message: '密钥解密失败，请重新填写该通道的 API 密钥' }
    }
  }

  return { state, upsert, remove, setActive, resolveForRequest }
}

module.exports = {
  CONFIG_VERSION,
  PROTOCOLS,
  MAX_CHANNELS,
  normalizeBaseUrl,
  validateChannel,
  publicChannel,
  createAiConfigStore,
}
