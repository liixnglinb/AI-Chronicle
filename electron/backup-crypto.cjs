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

function encryptBackup(plainText, password) {
  const salt = nodeCrypto.randomBytes(16)
  const iv = nodeCrypto.randomBytes(12)
  const key = nodeCrypto.scryptSync(password, salt, BACKUP_KEY_LENGTH)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      v: BACKUP_VERSION,
      kdf: 'scrypt',
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
  const key = nodeCrypto.scryptSync(
    password,
    Buffer.from(envelope.salt, 'base64'),
    BACKUP_KEY_LENGTH,
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
