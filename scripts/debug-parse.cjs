// 排查四个解析问题
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const HOME = os.homedir()

function firstLines(p, n, match) {
  const out = []
  const content = fs.readFileSync(p, 'utf8')
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (match && !match(t)) continue
    out.push(t.slice(0, 420))
    if (out.length >= n) break
  }
  return out
}

// 1. WorkBuddy 行结构
const wbDir = path.join(HOME, '.workbuddy', 'projects')
const wbFile = (function find(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isFile() && e.name.endsWith('.jsonl') && fs.statSync(f).size < 500000) return f
    if (e.isDirectory() && e.name !== 'subagents') {
      const r = find(f)
      if (r) return r
    }
  }
  return null
})(wbDir)
console.log('== workbuddy file:', wbFile)
if (wbFile) {
  const lines = firstLines(wbFile, 400)
  const types = {}
  for (const l of lines) {
    try {
      const o = JSON.parse(l)
      const k = o.type + (o.isSidechain ? '/side' : '')
      types[k] = (types[k] || 0) + 1
    } catch { types.BAD = (types.BAD || 0) + 1 }
  }
  console.log('workbuddy 类型分布(前400行):', JSON.stringify(types))
  const userLine = lines.find((l) => l.includes('"user"'))
  console.log('workbuddy 首个含 user 的行:', userLine ? userLine.slice(0, 500) : '无')
  const asstLine = lines.find((l) => l.includes('usage'))
  console.log('workbuddy 首个含 usage 的行:', asstLine ? asstLine.slice(0, 500) : '无')
}

// 2. CatPaw 类型分布
const cpDir = path.join(HOME, '.catpaw', 'projects')
const cpFile = (function find(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isFile() && e.name.endsWith('.jsonl') && fs.statSync(f).size < 500000) return f
    if (e.isDirectory()) {
      const r = find(f)
      if (r) return r
    }
  }
  return null
})(cpDir)
console.log('== catpaw file:', cpFile)
if (cpFile) {
  const lines = firstLines(cpFile, 300)
  const types = {}
  for (const l of lines) {
    try {
      const o = JSON.parse(l)
      types[o.type] = (types[o.type] || 0) + 1
    } catch { types.BAD = (types.BAD || 0) + 1 }
  }
  console.log('catpaw 类型分布(前300行):', JSON.stringify(types))
  const u = lines.find((l) => l.includes('"type": "user"') || l.includes('"type":"user"'))
  console.log('catpaw user 行:', u ? u.slice(0, 500) : '无')
}

// 3. Hermes 消息查询
const hermesDb = path.join(HOME, '.hermes', 'state.db')
{
  const db = new DatabaseSync(hermesDb, { readOnly: true })
  const sess = db.prepare('SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1').get()
  console.log('== hermes 最新会话:', sess.id)
  const cnt = db.prepare('SELECT COUNT(*) n FROM messages WHERE session_id = ?').get(sess.id)
  console.log('hermes 该会话消息数:', cnt.n)
  const roles = db.prepare('SELECT role, COUNT(*) n FROM messages WHERE session_id = ? GROUP BY role').all(sess.id)
  console.log('hermes 角色分布:', JSON.stringify(roles))
  const u = db.prepare("SELECT content FROM messages WHERE session_id = ? AND role='user' ORDER BY timestamp LIMIT 1").get(sess.id)
  console.log('hermes 首条用户消息:', u ? String(u.content).slice(0, 200) : '无')
  db.close()
}

// 4. Codex token_count 结构
const codexDir = path.join(HOME, '.codex', 'sessions')
const codexFile = (function find(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isFile() && e.name.endsWith('.jsonl')) return f
    if (e.isDirectory()) {
      const r = find(f)
      if (r) return r
    }
  }
  return null
})(codexDir)
console.log('== codex file:', codexFile)
if (codexFile) {
  const lines = firstLines(codexFile, 3, (l) => l.includes('"token_count"'))
  for (const l of lines) {
    const o = JSON.parse(l)
    console.log('codex token_count info keys:', JSON.stringify(Object.keys(o.payload?.info || {})))
    console.log('codex token_count total:', JSON.stringify(o.payload?.info?.total_token_usage))
    console.log('codex token_count last:', JSON.stringify(o.payload?.info?.last_token_usage))
    break
  }
}
// sessions 与 archived 是否重复
const idsSess = new Set()
const idsArch = new Set()
const sessRoot = path.join(HOME, '.codex', 'sessions')
const archRoot = path.join(HOME, '.codex', 'archived_sessions')
for (const [root, set] of [[sessRoot, idsSess], [archRoot, idsArch]]) {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.name.endsWith('.jsonl')) set.add(e.name)
    }
  }
  if (fs.existsSync(root)) walk(root)
}
const overlap = [...idsSess].filter((x) => idsArch.has(x))
console.log('codex sessions/archived 文件名重叠:', overlap.length, '/', idsSess.size, idsArch.size)
