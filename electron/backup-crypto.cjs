'use strict'
// 加密备份容器：scrypt 派生密钥 + AES-256-GCM 认证加密。
//
// 为什么不用 Electron 的 safeStorage：safeStorage 的密钥绑定当前机器的系统钥匙串，
// 备份换台电脑就打不开了。备份用「用户密码」派生密钥，才能跨设备恢复。
//
// 容器为 JSON 信封，带格式标识与版本号，便于后续演进与失败时给出明确提示。
const nodeCrypto = require('node:crypto')

const BACKUP_FORMAT = 'ai-chronicle-encrypted-backup'
const BACKUP_VERSION = 1
const BACKUP_KEY_LENGTH = 32

// scrypt 成本参数必须显式写死并随文件保存：以前两边都依赖 Node 默认值（N=2^14），
// 一旦默认值变化，旧备份就会以"密码错误"的形式静默解不开。
// 这里的值就是 Node 当时的默认，所以历史备份仍然可解。
const KDF_PARAMS = { N: 16384, r: 8, p: 1 }

function normalizeKdfParams(raw) {
  if (!raw || typeof raw !== 'object') return { ...KDF_PARAMS }
  const N = Number(raw.N) || KDF_PARAMS.N
  const r = Number(raw.r) || KDF_PARAMS.r
  const p = Number(raw.p) || KDF_PARAMS.p
  // 参数来自文件内容，必须夹住：否则一个 N=2^30 的信封能让解密卡死内存
  if (N < 1024 || N > 1 << 20 || N & (N - 1)) return { ...KDF_PARAMS }
  if (r < 1 || r > 16 || p < 1 || p > 4) return { ...KDF_PARAMS }
  return { N, r, p }
}

function deriveKey(password, salt, params) {
  return nodeCrypto.scryptSync(password, salt, BACKUP_KEY_LENGTH, params)
}

function encryptBackup(plainText, password) {
  const salt = nodeCrypto.randomBytes(16)
  const iv = nodeCrypto.randomBytes(12)
  const key = deriveKey(password, salt, KDF_PARAMS)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      v: BACKUP_VERSION,
      kdf: 'scrypt',
      kdfParams: KDF_PARAMS,
      cipher: 'aes-256-gcm',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: ciphertext.toString('base64'),
    },
    null,
    2,
  )
}

function decryptBackup(envelopeText, password) {
  let envelope
  try {
    envelope = JSON.parse(envelopeText)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!envelope || envelope.format !== BACKUP_FORMAT) {
    throw new Error('不是 AI 轨迹的加密备份文件')
  }
  if (envelope.v !== BACKUP_VERSION) {
    throw new Error(`不支持的备份版本：${envelope.v}`)
  }
  const key = deriveKey(
    password,
    Buffer.from(envelope.salt, 'base64'),
    normalizeKdfParams(envelope.kdfParams),
  )
  const decipher = nodeCrypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  // GCM 认证失败（密码错误 / 内容被篡改）会在这里抛错
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

module.exports = { encryptBackup, decryptBackup, BACKUP_FORMAT, BACKUP_VERSION }
