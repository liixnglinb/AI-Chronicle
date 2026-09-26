// 定点排查：hermes / catpaw / workbuddy 重复 / fzstd API
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const fzstd = require('fzstd')

const HOME = os.homedir()
console.log('fzstd 导出:', Object.keys(fzstd).join(', '))

// 1. hermes：复现 scanHermes 的查询
{
  const db = new DatabaseSync(path.join(HOME, '.hermes', 'state.db'), { readOnly: true })
  const rows = db
    .prepare('SELECT id, source, display_name, model, started_at FROM sessions ORDER BY started_at DESC LIMIT 3')
    .all()
  for (const r of rows) {
    try {
      const c = db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'user'")
        .get(r.id)
      console.log(`hermes ${r.id} 用户轮次:`, c ? Number(c.n) : 'null')
    } catch (err) {
      console.log(`hermes ${r.id} 查询异常:`, err.message)
    }
    try {
      const t = db
        .prepare(
          "SELECT COALESCE(SUM(CASE WHEN typeof(token_count) IN ('integer','real') THEN token_count ELSE 0 END), 0) AS tok FROM messages WHERE session_id = ?",
        )
        .get(r.id)
      console.log(`hermes ${r.id} token 合计:`, t ? Number(t.tok) : 'null')
    } catch (err) {
      console.log(`hermes ${r.id} token 异常:`, err.message)
    }
  }
  db.close()
}

// 2. catpaw：抽取一个文件里全部 user 文本候选
{
  const root = path.join(HOME, '.catpaw', 'projects')
  let target = null
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.isFile() && e.name.endsWith('.jsonl') && fs.statSync(f).size < 2_000_000) {
        target = f
      }
    }
  }
  walk(root)
  console.log('== catpaw 文件:', target)
  const content = fs.readFileSync(target, 'utf8')
  let userIdx = 0
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let o
    try {
      o = JSON.parse(t)
    } catch {
      continue
    }
    if (o.type !== 'user') continue
    userIdx += 1
    if (userIdx > 5) break
    const m = o.message || {}
    const parts = Array.isArray(m.content) ? m.content : []
    const kinds = parts.map((c) => c && c.type).join(',')
    const texts = parts
      .filter((c) => c && c.type === 'text')
      .map((c) => String(c.text).replace(/\s+/g, ' ').slice(0, 60))
    console.log(`  user#${userIdx} parts=[${kinds}] texts=`, JSON.stringify(texts))
  }
}

// 3. workbuddy 与 workbuddy-ai 是否同会话复制
{
  const wb = path.join(HOME, '.workbuddy', 'projects')
  const wbAi = path.join(HOME, '.workbuddy-ai', 'projects')
  const uuidOf = (root) => {
    const set = new Map()
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name)
        if (e.isDirectory() && e.name !== 'subagents') walk(f)
        else if (e.isFile() && e.name.endsWith('.jsonl')) {
          set.set(e.name, fs.statSync(f).size)
        }
      }
    }
    if (fs.existsSync(root)) walk(root)
    return set
  }
  const a = uuidOf(wb)
  const b = uuidOf(wbAi)
  const overlap = [...b.keys()].filter((k) => a.has(k))
  console.log(`workbuddy 文件 ${a.size} 个, workbuddy-ai 文件 ${b.size} 个, 同名重叠 ${overlap.length}`)
  if (overlap.length) console.log('  重叠例:', overlap.slice(0, 3).join(' | '))
}

// 4. DSH 解压
{
  const root = path.join(HOME, '.dsh', 'sessions')
  let target = null
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.isFile() && e.name === 'session.jsonl.zstd') target = f
    }
  }
  walk(root)
  if (target) {
    try {
      const raw = fzstd.decompress(new Uint8Array(fs.readFileSync(target)))
      const text = Buffer.from(raw).toString('utf8')
      const lines = text.split('\n').filter((x) => x.trim()).slice(0, 2)
      console.log('== dsh 解压成功:', target)
      for (const l of lines) console.log('  ', l.slice(0, 300))
    } catch (err) {
      console.log('== dsh 解压失败:', err.message)
    }
  }
}
