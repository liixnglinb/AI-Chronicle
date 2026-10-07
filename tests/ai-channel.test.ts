import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface PublicChannel {
  id: string
  name: string
  protocol: string
  baseUrl: string
  model: string
  hasKey: boolean
}
type UpsertResult =
  { ok: true; channel: PublicChannel; activeId: string | null } | { ok: false; message: string }
type FakeCrypto = { encrypt: (t: string) => string; decrypt: (b: string) => string }
interface AiConfigModule {
  MAX_CHANNELS: number
  normalizeBaseUrl: (raw: unknown) => { ok: true; value: string } | { ok: false; message: string }
  validateChannel: (
    input: Record<string, unknown>,
  ) =>
    | { ok: true; value: { name: string; protocol: string; model: string; baseUrl: string } }
    | { ok: false; message: string }
  createAiConfigStore: (options: {
    file: string
    crypto: FakeCrypto | null
    idFactory?: () => string
  }) => {
    state: () => {
      ok: boolean
      activeId: string | null
      channels: PublicChannel[]
      keyStorage: string
    }
    upsert: (input: Record<string, unknown>) => UpsertResult
    remove: (id: string) => { ok: boolean; message?: string; activeId?: string | null }
    setActive: (id: string) => { ok: boolean; message?: string }
    resolveForRequest: (
      id?: string | null,
    ) => { ok: true; channel: { key: string; id: string } } | { ok: false; message: string }
  }
}

/** 断言成功并收窄：测试里不写 ?. 链，任何一次 ok=false 都直接失败而不是静默跳过 */
function unwrap<T extends { ok: boolean; message?: string }>(r: T): T & { ok: true } {
  if (!r.ok) throw new Error(r.message || 'expected ok but failed')
  return r as T & { ok: true }
}

const { normalizeBaseUrl, validateChannel, createAiConfigStore, MAX_CHANNELS } =
  require('../electron/ai-config.cjs') as AiConfigModule

describe('normalizeBaseUrl', () => {
  it('补协议、去尾斜杠', () => {
    expect(normalizeBaseUrl('api.openai.com/v1/')).toEqual({
      ok: true,
      value: 'https://api.openai.com/v1',
    })
    expect(unwrap(normalizeBaseUrl('https://api.openai.com/v1///')).value).toBe(
      'https://api.openai.com/v1',
    )
  })

  it('允许本机与内网（模型通道刻意不复用公网白名单）', () => {
    expect(unwrap(normalizeBaseUrl('http://127.0.0.1:11434/v1')).value).toBe(
      'http://127.0.0.1:11434/v1',
    )
    expect(normalizeBaseUrl('http://localhost:1234/v1').ok).toBe(true)
    expect(unwrap(normalizeBaseUrl('http://192.168.1.20:8000')).value).toBe(
      'http://192.168.1.20:8000',
    )
  })

  it('拒绝非 http/https', () => {
    for (const bad of ['file:///etc/passwd', 'ftp://x/', 'javascript:alert(1)']) {
      expect(normalizeBaseUrl(bad).ok).toBe(false)
    }
  })

  it('拒绝带凭据、查询参数、锚点', () => {
    expect(normalizeBaseUrl('https://u:p@host/v1').ok).toBe(false)
    expect(normalizeBaseUrl('https://host/v1?key=1').ok).toBe(false)
    expect(normalizeBaseUrl('https://host/v1#frag').ok).toBe(false)
  })

  it('空值与不可解析', () => {
    expect(normalizeBaseUrl('').ok).toBe(false)
    expect(normalizeBaseUrl('   ').ok).toBe(false)
    expect(normalizeBaseUrl('http://').ok).toBe(false)
  })
})

describe('validateChannel', () => {
  const base = {
    name: '本地',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen3',
  }
  it('正常输入返回归一化结果', () => {
    const r = unwrap(validateChannel(base))
    expect(r.value.baseUrl).toBe('http://127.0.0.1:11434/v1')
  })
  it('协议受限', () => {
    expect(validateChannel({ ...base, protocol: 'grpc' }).ok).toBe(false)
  })
  it('名称/模型为空被拒', () => {
    expect(validateChannel({ ...base, name: '  ' }).ok).toBe(false)
    expect(validateChannel({ ...base, model: '' }).ok).toBe(false)
  })
  it('超长字段被截断而不是原样落盘', () => {
    const r = unwrap(validateChannel({ ...base, name: 'x'.repeat(200), model: 'm'.repeat(400) }))
    expect(r.value.name).toHaveLength(40)
    expect(r.value.model).toHaveLength(120)
  })
})

describe('createAiConfigStore', () => {
  let dir = ''
  let file = ''
  const fakeCrypto = {
    // 可逆的假加密，只为验证"落盘的不是明文"
    encrypt: (t: string) => Buffer.from(`enc:${t}`, 'utf8').toString('base64'),
    decrypt: (b: string) => {
      const s = Buffer.from(b, 'base64').toString('utf8')
      if (!s.startsWith('enc:')) throw new Error('bad')
      return s.slice(4)
    },
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ai-cfg-'))
    file = join(dir, 'ai-config.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const store = (crypto: FakeCrypto | null = fakeCrypto) =>
    createAiConfigStore({
      file,
      crypto,
      idFactory: () => `ch_fixed_${Math.random().toString(36).slice(2, 7)}`,
    })

  it('空状态可读，且声明钥匙串可用性', () => {
    const s = store()
    expect(s.state()).toMatchObject({
      ok: true,
      activeId: null,
      channels: [],
      keyStorage: 'available',
    })
  })

  it('保存通道后自动成为默认通道，公开视图不含密钥', () => {
    const s = store()
    const r = unwrap(
      s.upsert({
        name: '本地',
        protocol: 'openai',
        baseUrl: '127.0.0.1:11434/v1',
        model: 'qwen3',
        key: 'sk-local-123456',
      }),
    )
    expect(r.channel.hasKey).toBe(true)
    const state = s.state()
    expect(state.activeId).toBe(r.channel.id)
    expect(JSON.stringify(state)).not.toContain('sk-local-123456')
    expect(JSON.stringify(state)).not.toContain('keyEnc')
  })

  it('落盘的是密文，不是明文密钥', () => {
    const s = store()
    s.upsert({
      name: 'a',
      protocol: 'openai',
      baseUrl: 'h.example/v1',
      model: 'm',
      key: 'sk-super-secret-1',
    })
    const raw = readFileSync(file, 'utf8')
    expect(raw).not.toContain('sk-super-secret-1')
    expect(raw).toContain('keyEnc')
  })

  it('密钥留空 = 保留原密钥；空串 = 清除', () => {
    const s = store()
    const created = unwrap(
      s.upsert({
        name: 'a',
        protocol: 'openai',
        baseUrl: 'h/v1',
        model: 'm',
        key: 'sk-keepme-123',
      }),
    )
    const id = created.channel.id
    const patched = unwrap(
      s.upsert({ id, name: '改名', protocol: 'openai', baseUrl: 'h/v1', model: 'm2' }),
    )
    expect(patched.channel.hasKey).toBe(true)
    expect(unwrap(s.resolveForRequest(id)).channel.key).toBe('sk-keepme-123')
    const cleared = unwrap(
      s.upsert({ id, name: '改名', protocol: 'openai', baseUrl: 'h/v1', model: 'm2', key: '' }),
    )
    expect(cleared.channel.hasKey).toBe(false)
    expect(unwrap(s.resolveForRequest(id)).channel.key).toBe('')
  })

  it('钥匙串不可用时拒绝存密钥，且不退化成明文', () => {
    const s = store(null)
    const r = s.upsert({
      name: 'a',
      protocol: 'openai',
      baseUrl: 'h/v1',
      model: 'm',
      key: 'sk-plain-123',
    })
    if (r.ok) throw new Error('钥匙串不可用时不该保存成功')
    expect(r.message).toContain('钥匙串')
    // 直接被拒，连通道都不会落盘；落盘内容里当然也不许出现明文
    const raw = existsSync(file) ? readFileSync(file, 'utf8') : ''
    expect(raw).not.toContain('sk-plain-123')
    // 无密钥通道仍可保存（本机 ollama 这类不需要 key）
    expect(s.upsert({ name: 'a', protocol: 'openai', baseUrl: 'h/v1', model: 'm' }).ok).toBe(true)
    expect(s.state().keyStorage).toBe('unavailable')
  })

  it('删除最后一个通道后默认位清空', () => {
    const s = store()
    const a = unwrap(s.upsert({ name: 'a', protocol: 'openai', baseUrl: 'h/v1', model: 'm' }))
    const b = unwrap(s.upsert({ name: 'b', protocol: 'anthropic', baseUrl: 'h2/v1', model: 'm2' }))
    s.remove(a.channel.id)
    expect(s.state().activeId).toBe(b.channel.id)
    s.remove(b.channel.id)
    expect(s.state().activeId).toBeNull()
    expect(s.state().channels).toHaveLength(0)
  })

  it('通道数有上限，超了直接拒而不是无限增长', () => {
    const s = store()
    for (let i = 0; i < MAX_CHANNELS; i++) {
      expect(s.upsert({ name: `c${i}`, protocol: 'openai', baseUrl: 'h/v1', model: 'm' }).ok).toBe(
        true,
      )
    }
    const over = s.upsert({ name: 'over', protocol: 'openai', baseUrl: 'h/v1', model: 'm' })
    expect(over.ok).toBe(false)
    expect(s.state().channels).toHaveLength(MAX_CHANNELS)
  })

  it('setActive 与 resolveForRequest 对不存在的 id 明确报错', () => {
    const s = store()
    expect(s.setActive('nope').ok).toBe(false)
    expect(s.resolveForRequest('nope').ok).toBe(false)
  })

  it('缓存文件被写坏时按空配置继续，不抛', () => {
    writeFileSync(file, '{not json', 'utf8')
    const s = store()
    expect(s.state().channels).toEqual([])
    expect(s.upsert({ name: 'a', protocol: 'openai', baseUrl: 'h/v1', model: 'm' }).ok).toBe(true)
  })

  it('解密失败时报"请重新填写密钥"而不是发一个空 key 出去', () => {
    const s = store()
    const r = unwrap(
      s.upsert({ name: 'a', protocol: 'openai', baseUrl: 'h/v1', model: 'm', key: 'sk-x-123456' }),
    )
    const config = JSON.parse(readFileSync(file, 'utf8'))
    config.channels[0].keyEnc = Buffer.from('garbage', 'utf8').toString('base64')
    writeFileSync(file, JSON.stringify(config), 'utf8')
    const resolved = s.resolveForRequest(r.channel.id)
    if (resolved.ok) throw new Error('密钥解密失败时不该返回可用通道')
    expect(resolved.message).toContain('解密失败')
  })
})
