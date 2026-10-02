import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { encryptBackup, decryptBackup, BACKUP_FORMAT } =
  require('../electron/backup-crypto.cjs') as {
    encryptBackup: (plain: string, password: string) => string
    decryptBackup: (envelope: string, password: string) => string
    BACKUP_FORMAT: string
  }
const { IngestCache, CACHE_VERSION } = require('../electron/ingest.cjs') as {
  IngestCache: new (
    cachePath: string,
    crypto?: { encrypt: (text: string) => string; decrypt: (data: string) => string } | null,
  ) => {
    data: { v: number; files: Record<string, unknown> }
    get: (file: string, mtime: number, size: number) => unknown
    put: (file: string, mtime: number, size: number, session: unknown) => void
    save: () => void
  }
  CACHE_VERSION: number
}

const tempDirs: string[] = []

function tempFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chronicle-test-'))
  tempDirs.push(dir)
  return path.join(dir, name)
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('加密备份容器', () => {
  const password = 'correct horse battery staple'

  it('加解密往返保持内容不变（含中文与换行）', () => {
    const payload = JSON.stringify({ exportedAt: '2026-10-02T00:00:00Z', 项目: '每日使用日志' })
    const envelope = encryptBackup(payload, password)
    expect(decryptBackup(envelope, password)).toBe(payload)
  })

  it('信封带格式标识与版本号，便于后续演进', () => {
    const envelope = JSON.parse(encryptBackup('x', password))
    expect(envelope.format).toBe(BACKUP_FORMAT)
    expect(envelope.v).toBe(1)
    expect(envelope.kdf).toBe('scrypt')
    expect(envelope.cipher).toBe('aes-256-gcm')
  })

  it('明文不出现在密文文件中', () => {
    const secret = '这是我的会话标题'
    expect(encryptBackup(secret, password)).not.toContain(secret)
  })

  it('相同明文两次加密得到不同密文（盐与 IV 随机）', () => {
    expect(encryptBackup('same', password)).not.toBe(encryptBackup('same', password))
  })

  it('密码错误时解密失败（GCM 认证不通过）', () => {
    const envelope = encryptBackup('data', password)
    expect(() => decryptBackup(envelope, 'wrong password')).toThrow()
  })

  it('密文被篡改时解密失败', () => {
    const envelope = JSON.parse(encryptBackup('data', password))
    const bytes = Buffer.from(envelope.data, 'base64')
    bytes[0] = bytes[0] ^ 0xff
    envelope.data = bytes.toString('base64')
    expect(() => decryptBackup(JSON.stringify(envelope), password)).toThrow()
  })

  it('非备份文件给出明确错误', () => {
    expect(() => decryptBackup('{"hello":1}', password)).toThrow('不是 AI 轨迹的加密备份文件')
    expect(() => decryptBackup('not json', password)).toThrow('文件不是有效的 JSON')
  })
})

describe('采集缓存加密', () => {
  const session = { id: 's1', title: '机密会话', projectPath: 'C:\\secret' }

  it('注入 crypto 时以密文落盘，且可原样读回', () => {
    const file = tempFile('cache.json')
    // 用 base64 代替 safeStorage：同样是「落盘不可直接读出明文」的可逆变换
    const crypto = {
      encrypt: (text: string) => Buffer.from(text, 'utf8').toString('base64'),
      decrypt: (data: string) => Buffer.from(data, 'base64').toString('utf8'),
    }

    const writer = new IngestCache(file, crypto)
    writer.put('C:\\log.jsonl', 1, 2, session)
    writer.save()

    const raw = fs.readFileSync(file, 'utf8')
    expect(raw).toContain('"enc":true')
    expect(raw).not.toContain('机密会话')

    const reader = new IngestCache(file, crypto)
    expect(reader.get('C:\\log.jsonl', 1, 2)).toEqual(session)
  })

  it('未注入 crypto 时退化为明文（保证纯 Node 环境可用）', () => {
    const file = tempFile('cache.json')
    const writer = new IngestCache(file, null)
    writer.put('a', 1, 1, session)
    writer.save()
    expect(fs.readFileSync(file, 'utf8')).toContain('机密会话')
    expect(new IngestCache(file, null).get('a', 1, 1)).toEqual(session)
  })

  it('缓存失效条件：mtime 或 size 变化即不命中', () => {
    const file = tempFile('cache.json')
    const cache = new IngestCache(file, null)
    cache.put('a', 100, 200, session)
    expect(cache.get('a', 100, 200)).toEqual(session)
    expect(cache.get('a', 101, 200)).toBeNull()
    expect(cache.get('a', 100, 201)).toBeNull()
  })

  it('解密失败（如系统钥匙串重置）时当作无缓存，触发全量重扫而不是崩溃', () => {
    const file = tempFile('cache.json')
    const good = {
      encrypt: (text: string) => text,
      decrypt: (data: string) => data,
    }
    const writer = new IngestCache(file, good)
    writer.put('a', 1, 1, session)
    writer.save()

    const broken = {
      encrypt: (text: string) => text,
      decrypt: () => {
        throw new Error('keychain reset')
      },
    }
    const reader = new IngestCache(file, broken)
    expect(reader.data.v).toBe(CACHE_VERSION)
    expect(reader.data.files).toEqual({})
    expect(reader.get('a', 1, 1)).toBeNull()
  })

  it('缺少解密能力时忽略密文缓存', () => {
    const file = tempFile('cache.json')
    const crypto = { encrypt: (t: string) => t, decrypt: (d: string) => d }
    const writer = new IngestCache(file, crypto)
    writer.put('a', 1, 1, session)
    writer.save()

    expect(new IngestCache(file, null).get('a', 1, 1)).toBeNull()
  })
})
