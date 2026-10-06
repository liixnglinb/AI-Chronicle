import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { encryptBackup, decryptBackup, BACKUP_FORMAT } =
  require('../electron/backup-crypto.cjs') as {
    encryptBackup: (plain: string, password: string) => string
    decryptBackup: (envelope: string, password: string) => string
    BACKUP_FORMAT: string
  }

const PASSWORD = 'correct horse battery staple'

describe('加密备份信封', () => {
  it('同机往返：明文进、明文出', () => {
    const text = JSON.stringify({ sessions: [{ id: 'a', title: '干了点活' }] })
    expect(decryptBackup(encryptBackup(text, PASSWORD), PASSWORD)).toBe(text)
  })

  it('密码错时报错，且不返回半截内容', () => {
    const envelope = encryptBackup('{"a":1}', PASSWORD)
    expect(() => decryptBackup(envelope, 'wrong password')).toThrow()
  })

  it('KDF 成本参数必须写进信封（否则 Node 默认值一变，老备份就静默解不开）', () => {
    const envelope = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    expect(envelope.kdf).toBe('scrypt')
    expect(envelope.kdfParams).toMatchObject({ N: 16384, r: 8, p: 1 })
    expect(envelope.salt).toBeTruthy()
    expect(envelope.iv).toBeTruthy()
    expect(envelope.tag).toBeTruthy()
  })

  it('没有 kdfParams 的历史信封仍可解密', () => {
    const withParams = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    const legacy = { ...withParams }
    delete (legacy as { kdfParams?: unknown }).kdfParams
    expect(decryptBackup(JSON.stringify(legacy), PASSWORD)).toBe('{"a":1}')
  })

  it('信封里的 N 被改成天文数字时夹回默认参数，而不是去分配 11GB 内存', () => {
    const envelope = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    envelope.kdfParams = { N: 1 << 30, r: 8, p: 1 }
    // 真按 N=2^30 派生会先 OOM / 抛 RangeError；夹回默认参数后密钥仍与密文匹配，
    // 所以"能正常解出明文"就是夹取生效的证据（机密性本来也由 GCM 标签兜着）。
    expect(() => decryptBackup(JSON.stringify(envelope), PASSWORD)).not.toThrow()
    expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).toBe('{"a":1}')
  })

  it('参数被改成不合法的小值（N 非 2 的幂）时同样退回默认', () => {
    const envelope = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    envelope.kdfParams = { N: 10000, r: 99, p: 0 }
    expect(decryptBackup(JSON.stringify(envelope), PASSWORD)).toBe('{"a":1}')
  })

  it('密文被篡改时报错（GCM 认证标签生效）', () => {
    const envelope = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    const bytes = Buffer.from(envelope.data, 'base64')
    bytes[0] ^= 0xff
    envelope.data = bytes.toString('base64')
    expect(() => decryptBackup(JSON.stringify(envelope), PASSWORD)).toThrow()
  })

  it('不是本应用的格式时给出明确原因，而不是通用异常', () => {
    expect(() => decryptBackup('不是 JSON', PASSWORD)).toThrow('文件不是有效的 JSON')
    expect(() => decryptBackup(JSON.stringify({ format: 'other-app', v: 1 }), PASSWORD)).toThrow(
      /不是 AI 轨迹的加密备份/,
    )
    expect(() => decryptBackup(JSON.stringify({ format: BACKUP_FORMAT, v: 99 }), PASSWORD)).toThrow(
      /不支持的备份版本/,
    )
  })

  it('每次导出的 salt/iv 都不同（相同明文不产生相同密文）', () => {
    const a = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    const b = JSON.parse(encryptBackup('{"a":1}', PASSWORD))
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })
})
