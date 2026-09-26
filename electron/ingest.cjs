// AI 轨迹 — 真实数据采集层
// 从本机各 AI 软件的会话日志/数据库解析出标准化会话记录。
// 原则：只读（SQLite 全部 readOnly 打开）、可缓存（文件级 mtime+size）、
//       超时不丢弃（按最近文件优先，明确留痕）、解析失败只影响单源。
// SQL 全部为固定字面量，值一律参数绑定。
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { DatabaseSync } = require('node:sqlite')
const { decompress: zstdDecompress } = require('fzstd')

// ---------------------------------------------------------------- 工具元数据
const TOOLS = {
  'claude-code': { name: 'Claude Code', color: '#D97757' },
  codex: { name: 'Codex', color: '#10A37F' },
  zcode: { name: 'ZCode', color: '#7C6BF0' },
  opencode: { name: 'OpenCode', color: '#3B9EFF' },
  hermes: { name: 'Hermes', color: '#E8A33D' },
  agnes: { name: 'Agnes', color: '#4FC3A1' },
  workbuddy: { name: 'WorkBuddy', color: '#2F9E77' },
  'workbuddy-ai': { name: 'WorkBuddy AI', color: '#5BB98C' },
  catpaw: { name: 'CatPaw', color: '#F2B33D' },
  mhagent: { name: 'MHAgent', color: '#8B7CF6' },
  modex: { name: '织流 Loom', color: '#3D8BFD' },
  dsh: { name: 'DSH', color: '#5B8DEF' },
}

// ---------------------------------------------------------------- 路径与预算
const HOME = os.homedir()
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming')

const MAX_FILE_BYTES = 96 * 1024 * 1024
const MAX_FILES_PER_SOURCE = 4000
const SOURCE_BUDGET_MS = 25_000

function expandPath(value) {
  return String(value)
    .replace(/^~(?=$|[\\/])/, HOME)
    .replace(/%APPDATA%/gi, APPDATA)
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'))
}

// ---------------------------------------------------------------- 时间解析
function msFromValue(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    return v > 1e12 ? v : v > 1e9 ? Math.round(v * 1000) : null
  }
  if (typeof v === 'string') {
    const s = v.trim()
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s)
    if (m) {
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
    }
    const t = Date.parse(s)
    return Number.isNaN(t) ? null : t
  }
  return null
}

// ---------------------------------------------------------------- 文本清洗
function cleanText(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/\s+/g, ' ').trim()
}

// 判断是否为系统注入/环境说明类文本（只用作标题选择，不影响轮次计数）
function isInjectedTitle(text) {
  if (!text) return true
  return (
    text.startsWith('<') ||
    text.startsWith('Caveat:') ||
    text.startsWith('[Request interrupted') ||
    text.startsWith('# AGENTS.md') ||
    text.startsWith('## IMPORTANT') ||
    text.startsWith('# IMPORTANT') ||
    text.startsWith('This session is being continued') ||
    text.startsWith('system-reminder')
  )
}

// 剥离文本开头的注入块（自闭合如 <sandbox_context ... />，成对如
// <expert_instructions>…</expert_instructions>），让同段里的真实输入露出来
function stripLeadingInjection(text) {
  let s = text
  for (let i = 0; i < 5; i++) {
    const selfClose = /^<[^<>]*\/>\s*/.exec(s)
    if (selfClose) {
      s = s.slice(selfClose[0].length)
      continue
    }
    const paired = /^<([a-zA-Z][\w-]*)[^>]*>[\s\S]*?<\/\1>\s*/.exec(s)
    if (paired) {
      s = s.slice(paired[0].length)
      continue
    }
    break
  }
  return s.trim()
}

// 从一条候选文本提取标题：先剥注入，再判断是否剩余正文
function titleFromCandidate(raw, session, countTurn) {
  const direct = cleanText(raw)
  if (!direct) return false
  if (countTurn) session.turns += 1
  if (session.title) return true
  let s = direct
  if (isInjectedTitle(s)) {
    const stripped = cleanText(stripLeadingInjection(raw))
    if (stripped && !isInjectedTitle(stripped)) s = stripped
    else return true
  }
  session.title = pickTitle(s)
  return true
}

function pickTitle(text, max = 90) {
  const s = cleanText(text)
  if (!s) return ''
  if (s.length > max) return s.slice(0, max) + '…'
  return s
}

function basenameOf(p) {
  if (!p || typeof p !== 'string') return ''
  const norm = p.replace(/[\\/]+$/, '')
  const base = norm.split(/[\\/]/).pop() || ''
  return base
}

// 目录名 -> 项目路径（WorkBuddy / Claude projects 风格）
function decodeDirProject(dirName) {
  if (!dirName) return ''
  const m = /^[Cc]-[-](.*)$/.exec(dirName)
  if (!m) return dirName
  return 'C:\\' + m[1].replace(/-/g, '\\')
}

// ---------------------------------------------------------------- 会话结构
function makeSession(tool, id) {
  return {
    id,
    tool,
    toolName: (TOOLS[tool] || {}).name || tool,
    toolColor: (TOOLS[tool] || {}).color || '#828B99',
    title: '',
    project: '',
    projectPath: '',
    start: null,
    end: null,
    turns: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
    model: '',
    hasTokens: false,
  }
}

function finalizeSession(s) {
  if (s.start === null && s.end === null) return null
  if (s.start === null) s.start = s.end
  if (s.end === null) s.end = s.start
  if (!s.title) s.title = '(未记录输入)'
  if (!s.project) s.project = '(未知位置)'
  return s
}

// ---------------------------------------------------------------- 文件枚举
const SKIP_DIRS = new Set([
  'cache', 'code cache', 'gpucache', 'crashpad', 'node_modules', 'subagents',
  'backups', 'tmp', 'blob_storage', 'serviceworker', 'telemetry', '.git',
])

function listFiles(roots, filter, state) {
  const out = []
  function walk(dir, depth) {
    if (depth > 8 || out.length >= MAX_FILES_PER_SOURCE) {
      if (out.length >= MAX_FILES_PER_SOURCE) state.truncated = true
      return
    }
    if (Date.now() > state.deadline) {
      state.truncated = true
      return
    }
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES_PER_SOURCE) {
        state.truncated = true
        return
      }
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!filter(entry.name, dir)) continue
      try {
        const st = fs.statSync(full)
        if (st.size > MAX_FILE_BYTES) continue
        out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size })
      } catch {
        // 文件可能正在被写入
      }
    }
  }
  for (const root of roots) {
    if (fs.existsSync(root)) walk(root, 0)
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs) // 最新的先处理
  return out
}

// ---------------------------------------------------------------- JSONL 行读取
async function eachJsonlLine(filePath, onLine) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const t = line.trim()
    if (!t) continue
    try {
      onLine(JSON.parse(t))
    } catch {
      // 单行坏数据不影响整体
    }
  }
}

// ================================================================ Claude 同构 + WorkBuddy message 形态
// 同一解析器兼容两种行格式：
//  A) Claude Code 形态：type=user/assistant，obj.message.{content,usage}，cwd
//  B) WorkBuddy 形态：type=message + obj.role，content 数组（input_text 等），
//     timestamp 为毫秒；另有 type=ai-title 可作标题
function parseClaudeLikeFile(tool, filePath, dirNameHint) {
  const session = makeSession(tool, `${tool}:${filePath}`)
  const seenUsage = new Set()
  return eachJsonlLine(filePath, (obj) => {
    if (!obj || typeof obj !== 'object') return
    if (obj.isSidechain) return
    const ts = msFromValue(obj.timestamp)
    if (ts) {
      if (session.start === null || ts < session.start) session.start = ts
      if (session.end === null || ts > session.end) session.end = ts
    }
    if (!session.projectPath) {
      if (typeof obj.cwd === 'string' && obj.cwd) {
        session.projectPath = obj.cwd
      } else if (dirNameHint) {
        session.projectPath = decodeDirProject(dirNameHint)
      }
      if (session.projectPath) session.project = basenameOf(session.projectPath)
    }
    if (session.id === `${tool}:${filePath}`) {
      const sid = obj.sessionId || obj.session_id
      if (typeof sid === 'string' && sid) session.id = `${tool}:${sid}`
    }
    // WorkBuddy ai-title
    if (obj.type === 'ai-title' && !session.title) {
      const cand = obj.title || obj.aiTitle || obj.text || obj.content
      if (typeof cand === 'string') session.title = pickTitle(cand)
    }

    // ---- Claude 形态 ----
    if (obj.type === 'user' || obj.type === 'assistant') {
      const m = obj.message || {}
      let role = obj.type
      let contents = m.content
      const usage = m.usage || obj.usage
      if (obj.type === 'assistant' && usage && typeof usage === 'object') {
        const key = m.id || obj.uuid
        if (!(key && seenUsage.has(key))) {
          if (key) seenUsage.add(key)
          session.tokensIn += usage.input_tokens || 0
          session.tokensCached +=
            (usage.cache_read_input_tokens || 0) +
            (usage.cache_creation_input_tokens || 0)
          session.tokensOut += usage.output_tokens || 0
          session.hasTokens = true
          if (m.model && !session.model) session.model = m.model
        }
      }
      if (role === 'user' && !obj.isMeta) {
        let texts = []
        if (typeof contents === 'string') texts = [contents]
        else if (Array.isArray(contents)) {
          texts = contents
            .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text)
        }
        let counted = false
        for (const raw of texts) {
          const handled = titleFromCandidate(raw, session, !counted)
          if (handled) counted = true
        }
      }
      return
    }

    // ---- WorkBuddy message 形态 ----
    if (obj.type === 'message') {
      const role = obj.role
      const contents = Array.isArray(obj.content) ? obj.content : []
      if (role === 'user') {
        let counted = false
        for (const c of contents) {
          if (!c || typeof c.text !== 'string') continue
          const handled = titleFromCandidate(c.text, session, !counted)
          if (handled) counted = true
        }
      }
    }
  }).then(() => {
    if (!session.projectPath && dirNameHint) {
      session.projectPath = decodeDirProject(dirNameHint)
      session.project = basenameOf(session.projectPath)
    }
    return finalizeSession(session)
  })
}

// ================================================================ Codex rollout
const CODEX_UUID_RE = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i

function parseCodexFile(filePath) {
  const session = makeSession('codex', `codex:${filePath}`)
  let lastUsage = null
  let sawAny = false
  return eachJsonlLine(filePath, (obj) => {
    if (!obj || typeof obj !== 'object') return
    sawAny = true
    const ts = msFromValue(obj.timestamp)
    if (ts) {
      if (session.start === null || ts < session.start) session.start = ts
      if (session.end === null || ts > session.end) session.end = ts
    }
    if (obj.type === 'session_meta') {
      const p = obj.payload || {}
      if (session.id.startsWith('codex:')) {
        session.id = `codex:${p.session_id || filePath}`
      }
      if (p.cwd) {
        session.projectPath = p.cwd
        session.project = basenameOf(p.cwd)
      }
    }
    if (obj.type === 'turn_context') {
      const p = obj.payload || {}
      if (p.model) session.model = p.model
      if (p.cwd && !session.projectPath) {
        session.projectPath = p.cwd
        session.project = basenameOf(p.cwd)
      }
    }
    if (obj.type === 'event_msg') {
      const p = obj.payload || {}
      if (p.type === 'user_message' && typeof p.message === 'string') {
        titleFromCandidate(p.message, session, true)
      }
      if (p.type === 'token_count') {
        const tt = (p.info || {}).total_token_usage
        if (tt && typeof tt === 'object') lastUsage = tt
      }
    }
    if (!session.title && obj.type === 'response_item') {
      const p = obj.payload || {}
      if (p.type === 'message' && p.role === 'user') {
        const parts = Array.isArray(p.content) ? p.content : []
        for (const c of parts) {
          if (c && c.type === 'input_text' && typeof c.text === 'string') {
            const s = cleanText(c.text)
            if (s && !isInjectedTitle(s)) {
              session.title = pickTitle(s)
              break
            }
          }
        }
      }
    }
  }).then(() => {
    if (lastUsage) {
      // 与 Token Monitor 同口径：供应商 total_tokens 为权威总量，
      // 缓存命中量在总量预算内截取，避免 input+cached+output 虚高
      const iv = (x) => (typeof x === 'number' && x > 0 ? x : 0)
      const ti = iv(lastUsage.input_tokens)
      const rawCr = iv(lastUsage.cached_input_tokens)
      const cw = iv(lastUsage.cache_write_input_tokens)
      const out = iv(lastUsage.output_tokens)
      const providerTotal = iv(lastUsage.total_tokens)
      let inp
      let cr
      if (providerTotal) {
        const budget = Math.max(providerTotal - cw - out, 0)
        cr = Math.min(rawCr, budget)
        inp = budget - cr
      } else if (rawCr > ti) {
        inp = ti
        cr = rawCr
      } else {
        inp = ti - rawCr
        cr = rawCr
      }
      session.tokensIn = inp
      session.tokensCached = cr + cw
      session.tokensOut = out
      session.hasTokens = true
    }
    return sawAny ? finalizeSession(session) : null
  })
}

// ================================================================ SQLite 通用
function openDbReadOnly(dbPath) {
  return new DatabaseSync(dbPath, { readOnly: true })
}

function extractUserTextFromParts(rows) {
  for (const row of rows) {
    try {
      const part = JSON.parse(row.data)
      if (part && part.type === 'text' && typeof part.text === 'string') {
        let s = cleanText(part.text)
        if (!s) continue
        if (isInjectedTitle(s)) {
          const stripped = cleanText(stripLeadingInjection(part.text))
          if (!stripped || isInjectedTitle(stripped)) continue
          s = stripped
        }
        return pickTitle(s)
      }
    } catch {
      // 忽略坏 JSON
    }
  }
  return ''
}

// ZCode / OpenCode（OpenCode 系 schema）
function scanOpenCodeFamily(tool, dbPath, opts) {
  const sessions = []
  let db
  try {
    db = openDbReadOnly(dbPath)
  } catch (err) {
    return { sessions, note: '数据库无法只读打开: ' + String(err && err.message).slice(0, 80) }
  }
  try {
    const withTokens = !!opts.tokensFromModelUsage
    const rows = db
      .prepare(
        'SELECT id, directory, title, time_created, time_updated FROM session ORDER BY time_created ASC',
      )
      .all()
    // 一次取全部消息角色：找每个会话第一条用户消息 + 用户轮次数
    const msgRows = db
      .prepare('SELECT id, session_id, data FROM message ORDER BY time_created ASC')
      .all()
    const firstUser = new Map()
    const userCount = new Map()
    const modelOf = new Map()
    for (const row of msgRows) {
      let role = ''
      try {
        const data = JSON.parse(row.data)
        role = data && data.role
        if (data && data.model && data.model.modelID && !modelOf.has(row.session_id)) {
          modelOf.set(row.session_id, data.model.modelID)
        }
      } catch {
        continue
      }
      if (role !== 'user') continue
      userCount.set(row.session_id, (userCount.get(row.session_id) || 0) + 1)
      if (!firstUser.has(row.session_id)) firstUser.set(row.session_id, row.id)
    }
    // 第一条用户消息的文本 part：一遍扫描 part 表（固定 SQL，JS 过滤）
    const firstIds = new Set(firstUser.values())
    const titleOf = new Map()
    if (firstIds.size) {
      const partRows = db
        .prepare("SELECT message_id, data FROM part WHERE data LIKE '%\"type\":\"text\"%'")
        .all()
      const byMsg = new Map()
      for (const pr of partRows) {
        if (!firstIds.has(pr.message_id)) continue
        if (!byMsg.has(pr.message_id)) byMsg.set(pr.message_id, [])
        byMsg.get(pr.message_id).push(pr)
      }
      for (const [sid, mid] of firstUser) {
        const text = extractUserTextFromParts(byMsg.get(mid) || [])
        if (text) titleOf.set(sid, text)
      }
    }
    // 每会话 token（仅 ZCode 有 model_usage）
    const usageOf = new Map()
    if (withTokens) {
      const uRows = db
        .prepare(
          'SELECT session_id, model_id, input_tokens, output_tokens, reasoning_tokens,'
          + ' cache_creation_input_tokens, cache_read_input_tokens FROM model_usage',
        )
        .all()
      for (const u of uRows) {
        const cur = usageOf.get(u.session_id) || {
          i: 0, o: 0, r: 0, cw: 0, cr: 0, byModel: new Map(),
        }
        cur.i += u.input_tokens || 0
        cur.o += u.output_tokens || 0
        cur.r += u.reasoning_tokens || 0
        cur.cw += u.cache_creation_input_tokens || 0
        cur.cr += u.cache_read_input_tokens || 0
        const mTot =
          (u.input_tokens || 0) + (u.output_tokens || 0) + (u.reasoning_tokens || 0)
        cur.byModel.set(u.model_id, (cur.byModel.get(u.model_id) || 0) + mTot)
        usageOf.set(u.session_id, cur)
      }
    }
    for (const r of rows) {
      const s = makeSession(tool, `${tool}:${r.id}`)
      s.title = (r.title && String(r.title).trim()) || titleOf.get(r.id) || ''
      s.projectPath = r.directory || ''
      s.project = basenameOf(r.directory) || ''
      s.start = msFromValue(r.time_created)
      s.end = msFromValue(r.time_updated) || s.start
      s.turns = userCount.get(r.id) || 0
      if (!s.model) s.model = modelOf.get(r.id) || ''
      if (withTokens && usageOf.has(r.id)) {
        const u = usageOf.get(r.id)
        s.tokensIn = u.i
        s.tokensOut = u.o + u.r
        s.tokensCached = u.cw + u.cr
        s.hasTokens = true
        let bestModel = ''
        let bestTot = -1
        for (const [mName, tot] of u.byModel) {
          if (tot > bestTot) {
            bestTot = tot
            bestModel = mName
          }
        }
        s.model = bestModel || s.model
      }
      const finalized = finalizeSession(s)
      if (finalized) sessions.push(finalized)
    }
    return { sessions, note: '' }
  } catch (err) {
    return { sessions, note: '解析失败: ' + String(err && err.message).slice(0, 120) }
  } finally {
    try {
      db.close()
    } catch {
      // 忽略
    }
  }
}

// Hermes
function scanHermes(dbPath) {
  const sessions = []
  let db
  let lastErr = ''
  try {
    db = openDbReadOnly(dbPath)
  } catch (err) {
    return { sessions, note: '数据库无法只读打开: ' + String(err && err.message).slice(0, 80) }
  }
  try {
    const rows = db
      .prepare(
        'SELECT id, source, display_name, model, started_at, ended_at FROM sessions ORDER BY started_at ASC',
      )
      .all()
    for (const r of rows) {
      const s = makeSession('hermes', `hermes:${r.id}`)
      s.start = msFromValue(r.started_at)
      s.end = msFromValue(r.ended_at) || null
      s.model = r.model || ''
      s.project = r.source === 'desktop' ? 'Hermes 桌面' : String(r.source || '')
      try {
        const c = db
          .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'user'")
          .get(r.id)
        s.turns = c ? Number(c.n) : 0
      } catch (err) {
        lastErr = '轮次统计失败: ' + String(err && err.message).slice(0, 80)
      }
      try {
        const t = db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN typeof(token_count) IN ('integer','real') THEN token_count ELSE 0 END), 0) AS tok"
            + " FROM messages WHERE session_id = ?",
          )
          .get(r.id)
        if (t && Number(t.tok) > 0) {
          s.tokensIn = Number(t.tok)
          s.hasTokens = true
        }
      } catch (err) {
        lastErr = lastErr || 'token 统计失败: ' + String(err && err.message).slice(0, 80)
      }
      try {
        const first = db
          .prepare(
            "SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY timestamp ASC LIMIT 1",
          )
          .get(r.id)
        if (first && first.content) {
          let text = String(first.content)
          try {
            const parsed = JSON.parse(text)
            if (Array.isArray(parsed)) {
              const t2 = parsed.find((x) => x && x.type === 'text')
              if (t2 && typeof t2.text === 'string') text = t2.text
            } else if (parsed && typeof parsed.text === 'string') {
              text = parsed.text
            }
          } catch {
            // 纯文本
          }
          const s2 = cleanText(text)
          if (s2 && !isInjectedTitle(s2)) s.title = pickTitle(s2)
        }
      } catch (err) {
        lastErr = lastErr || '消息读取失败: ' + String(err && err.message).slice(0, 80)
      }
      if (!s.title && r.display_name) s.title = pickTitle(r.display_name)
      const finalized = finalizeSession(s)
      if (finalized) sessions.push(finalized)
    }
    return { sessions, note: lastErr }
  } catch (err) {
    return { sessions, note: '解析失败: ' + String(err && err.message).slice(0, 120) }
  } finally {
    try {
      db.close()
    } catch {
      // 忽略
    }
  }
}

// Agnes
function scanAgnes(dbPath) {
  const sessions = []
  let db
  try {
    db = openDbReadOnly(dbPath)
  } catch (err) {
    return { sessions, note: '数据库无法只读打开: ' + String(err && err.message).slice(0, 80) }
  }
  try {
    const rows = db
      .prepare(
        'SELECT id, name, working_dir, created_at, updated_at, total_tokens, input_tokens, output_tokens FROM sessions ORDER BY created_at ASC',
      )
      .all()
    for (const r of rows) {
      const s = makeSession('agnes', `agnes:${r.id}`)
      s.title = (r.name && String(r.name).trim()) || ''
      s.projectPath = r.working_dir || ''
      s.project = basenameOf(r.working_dir) || ''
      s.start = msFromValue(r.created_at)
      s.end = msFromValue(r.updated_at) || s.start
      if (r.total_tokens || r.input_tokens || r.output_tokens) {
        s.tokensIn = r.input_tokens || 0
        s.tokensOut = r.output_tokens || 0
        s.hasTokens = true
      }
      try {
        const c = db
          .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'user'")
          .get(r.id)
        s.turns = c ? Number(c.n) : 0
        if (!s.title) {
          const first = db
            .prepare(
              "SELECT content_json FROM messages WHERE session_id = ? AND role = 'user' ORDER BY timestamp ASC LIMIT 1",
            )
            .get(r.id)
          if (first && first.content_json) {
            const arr = JSON.parse(first.content_json)
            if (Array.isArray(arr)) {
              for (const x of arr) {
                if (x && x.type === 'text' && typeof x.text === 'string') {
                  const s2 = cleanText(x.text)
                  if (s2 && !isInjectedTitle(s2)) {
                    s.title = pickTitle(s2)
                    break
                  }
                }
              }
            }
          }
        }
      } catch {
        // 忽略消息查询失败
      }
      const finalized = finalizeSession(s)
      if (finalized) sessions.push(finalized)
    }
    return { sessions, note: '' }
  } catch (err) {
    return { sessions, note: '解析失败: ' + String(err && err.message).slice(0, 120) }
  } finally {
    try {
      db.close()
    } catch {
      // 忽略
    }
  }
}

// ================================================================ DSH（zstd 会话）
function decodeDshProject(dirName) {
  const s = dirName.replace(/~([0-9A-Fa-f]{4})~/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
  const cleaned = s.replace(/^--+|--+$/g, '')
  const segs = cleaned.split('-').filter(Boolean)
  return segs.length ? segs[segs.length - 1] : ''
}

async function parseDshFile(filePath, projectName) {
  const session = makeSession('dsh', `dsh:${filePath}`)
  session.project = projectName || '(未知位置)'
  let raw
  try {
    raw = zstdDecompress(new Uint8Array(fs.readFileSync(filePath)))
  } catch {
    return null
  }
  const text = Buffer.from(raw).toString('utf8')
  let maxCacheRead = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let obj
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }
    // session 首行：cwd / createdAt / id
    if (obj.type === 'session') {
      if (obj.cwd) {
        session.projectPath = obj.cwd
        session.project = basenameOf(obj.cwd) || session.project
      }
      if (session.id.startsWith('dsh:')) session.id = `dsh:${obj.id || filePath}`
      const ts = msFromValue(obj.createdAt)
      if (ts) session.start = ts
      continue
    }
    const ts = msFromValue(obj.time)
    if (ts) {
      if (session.start === null || ts < session.start) session.start = ts
      if (session.end === null || ts > session.end) session.end = ts
    }
    const type = String(obj.type || '')
    const data = obj.data || {}
    if (type.startsWith('user')) {
      let cand = ''
      if (typeof data.content === 'string') cand = data.content
      else if (Array.isArray(data.content)) {
        const part = data.content.find((c) => c && typeof c.text === 'string')
        if (part) cand = part.text
      } else if (typeof data.text === 'string') cand = data.text
      titleFromCandidate(cand, session, true)
    }
    if (type === 'assistant/message') {
      const u = data.usage
      if (u && typeof u === 'object') {
        session.tokensIn += u.inputTokens || 0
        session.tokensOut += u.outputTokens || 0
        maxCacheRead = Math.max(maxCacheRead, u.cacheReadTokens || 0)
        session.hasTokens = true
        if (data.model) session.model = data.model
      }
    }
  }
  session.tokensCached = maxCacheRead
  return finalizeSession(session)
}

// ================================================================ 缓存
class IngestCache {
  constructor(cachePath) {
    this.cachePath = cachePath
    this.data = { v: 1, files: {} }
    this.dirty = false
    try {
      const raw = fs.readFileSync(cachePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.v === 1 && parsed.files) this.data = parsed
    } catch {
      // 首次没有缓存
    }
  }

  get(filePath, mtimeMs, size) {
    const hit = this.data.files[filePath]
    if (hit && hit.m === mtimeMs && hit.s === size) return hit.session
    return null
  }

  put(filePath, mtimeMs, size, session) {
    this.data.files[filePath] = { m: mtimeMs, s: size, session }
    this.dirty = true
    if (Object.keys(this.data.files).length > 12000) this.trim()
  }

  trim() {
    const entries = Object.entries(this.data.files).sort(
      (a, b) => (b[1].m || 0) - (a[1].m || 0),
    )
    this.data.files = Object.fromEntries(entries.slice(0, 6000))
  }

  save() {
    if (!this.dirty) return
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true })
      const tmp = this.cachePath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
      fs.renameSync(tmp, this.cachePath)
      this.dirty = false
    } catch {
      // 缓存写失败不影响功能
    }
  }
}

// ================================================================ 观察中数据源
const OBSERVING_SOURCES = [
  { id: 'qoder', name: 'Qoder CN', paths: ['~/.qoder-cli/ai-stats'],
    reason: '用量记录在 IDE 内部数据库，暂无开放的会话导出' },
  { id: 'trae', name: 'TRAE SOLO CN', paths: ['%APPDATA%/TRAE SOLO CN', '~/.trae-cn'],
    reason: '会话数据为 SQLCipher 加密，暂无法离线解析' },
  { id: 'cursor', name: 'Cursor', paths: ['~/.cursor'],
    reason: '本地只有代码行统计，会话用量仅官方 API 可取' },
  { id: 'qianwen', name: '千问', paths: ['%APPDATA%/Qianwen'],
    reason: '桌面聊天应用，本地无会话日志' },
  { id: 'doubao', name: '豆包', paths: ['%APPDATA%/Doubao'],
    reason: '桌面聊天应用，本地无会话日志' },
  { id: 'grokbot', name: 'Grok Bot', paths: ['%APPDATA%/Grok Bot'],
    reason: '桌面聊天应用，本地无会话日志' },
  { id: 'pidesktop', name: 'Pi Desktop', paths: ['%LOCALAPPDATA%/Programs/pi'],
    reason: '未发现本地会话日志目录' },
  { id: 'kimi', name: 'Kimi Code', paths: ['~/.kimi/sessions'],
    reason: '日志未包含会话内容与用量，待适配' },
  { id: 'cline', name: 'Cline', paths: ['~/.cline'],
    reason: '数据为私有结构，待适配' },
  { id: 'codexpp', name: 'Codex++', paths: ['%APPDATA%/Codex++'],
    reason: '使用 Codex CLI 会话目录，已并入 Codex 统计' },
]

// ================================================================ 主入口
async function collectAll(options = {}) {
  const cachePath = options.cachePath
  const cache = cachePath ? new IngestCache(cachePath) : null
  const sessions = []
  const sources = []
  const usedCache = { hit: 0, miss: 0 }

  async function runFileSource(id, rootSpecs, parser, fileFilter, opts = {}) {
    const state = { deadline: Date.now() + SOURCE_BUDGET_MS, truncated: false }
    const roots = rootSpecs.map(expandPath)
    const exclude = opts.excludeNames
    const files = listFiles(roots, (name, dir) => {
      if (exclude && exclude.has(name)) return false
      return fileFilter(name, dir)
    }, state)
    const collected = []
    let truncated = state.truncated
    for (const f of files) {
      if (Date.now() > state.deadline) {
        truncated = true
        break
      }
      const dirName = path.basename(f.path, '.jsonl')
      let session = cache ? cache.get(f.path, f.mtimeMs, f.size) : null
      if (session) {
        usedCache.hit += 1
      } else {
        usedCache.miss += 1
        try {
          session = await parser(f.path, dirName)
        } catch {
          session = null
        }
        if (session && cache) cache.put(f.path, f.mtimeMs, f.size, session)
      }
      if (session) collected.push({ session, file: f })
    }
    // Codex：sessions 与 archived_sessions 可能含同一会话，按文件名 UUID 去重取更大者
    if (opts.dedupeByUuid) {
      const byUuid = new Map()
      for (const item of collected) {
        const m = CODEX_UUID_RE.exec(path.basename(item.file.path))
        const key = m ? m[1].toLowerCase() : item.file.path
        const prev = byUuid.get(key)
        if (!prev || item.file.size > prev.file.size) byUuid.set(key, item)
      }
      return finishSource([...byUuid.values()])
    }
    return finishSource(collected)

    function finishSource(items) {
      let lastActivity = null
      for (const { session } of items) {
        sessions.push(session)
        if (session.end && (!lastActivity || session.end > lastActivity)) {
          lastActivity = session.end
        }
      }
      return {
        id,
        name: (TOOLS[id] || {}).name || id,
        kind: 'connected',
        status: 'connected',
        sessionCount: items.length,
        lastActivity,
        detail: truncated ? '文件数超预算，已按最近文件优先采集' : '',
        note: '',
      }
    }
  }

  // Claude 同构源
  // workbuddy-ai 是 5.5+ 迁移目录，本机与 .workbuddy 文件同名重复 —— 排除旧目录已有的文件
  function collectWorkbuddyNames() {
    const names = new Set()
    const root = expandPath('~/.workbuddy/projects')
    const walk = (dir) => {
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory() && e.name.toLowerCase() !== 'subagents') walk(full)
        else if (e.isFile() && e.name.endsWith('.jsonl')) names.add(e.name)
      }
    }
    if (fs.existsSync(root)) walk(root)
    return names
  }

  const claudeLike = [
    { id: 'claude-code', roots: ['~/.claude/projects'] },
    { id: 'workbuddy', roots: ['~/.workbuddy/projects'] },
    { id: 'workbuddy-ai', roots: ['~/.workbuddy-ai/projects'],
      excludeNames: collectWorkbuddyNames() },
    { id: 'catpaw', roots: ['~/.catpaw/projects'] },
    { id: 'mhagent', roots: ['%APPDATA%/MHAgent/.claude/projects'] },
  ]
  for (const src of claudeLike) {
    try {
      const meta = await runFileSource(
        src.id,
        src.roots,
        (p, dirName) => parseClaudeLikeFile(src.id, p, path.basename(path.dirname(p))),
        (name) => name.endsWith('.jsonl'),
        { excludeNames: src.excludeNames },
      )
      sources.push(meta)
    } catch (err) {
      sources.push({
        id: src.id, name: TOOLS[src.id].name, kind: 'connected', status: 'error',
        sessionCount: 0, lastActivity: null,
        detail: '解析失败: ' + String(err && err.message).slice(0, 120), note: '',
      })
    }
  }

  // Modex（织流 Loom 的 Claude 会话）：只收 projects 路径段下的 jsonl
  try {
    const root = expandPath('%APPDATA%/ModexData')
    const state = { deadline: Date.now() + SOURCE_BUDGET_MS, truncated: false }
    const files = listFiles(
      [root],
      (name, dir) =>
        name.endsWith('.jsonl') && dir.split(/[\\/]/).includes('projects'),
      state,
    )
    let lastActivity = null
    let count = 0
    for (const f of files) {
      if (Date.now() > state.deadline) break
      let session = cache ? cache.get(f.path, f.mtimeMs, f.size) : null
      if (session) {
        usedCache.hit += 1
      } else {
        usedCache.miss += 1
        try {
          session = await parseClaudeLikeFile('modex', f.path, path.basename(path.dirname(f.path)))
        } catch {
          session = null
        }
        if (session && cache) cache.put(f.path, f.mtimeMs, f.size, session)
      }
      if (session) {
        sessions.push(session)
        count += 1
        if (session.end && (!lastActivity || session.end > lastActivity)) {
          lastActivity = session.end
        }
      }
    }
    sources.push({
      id: 'modex', name: TOOLS.modex.name, kind: 'connected', status: 'connected',
      sessionCount: count, lastActivity, detail: '', note: '',
    })
  } catch (err) {
    sources.push({
      id: 'modex', name: TOOLS.modex.name, kind: 'connected', status: 'error',
      sessionCount: 0, lastActivity: null,
      detail: '解析失败: ' + String(err && err.message).slice(0, 120), note: '',
    })
  }

  // Codex（sessions + archived 去重）
  try {
    const meta = await runFileSource(
      'codex',
      ['~/.codex/sessions', '~/.codex/archived_sessions'],
      (p) => parseCodexFile(p),
      (name) => name.endsWith('.jsonl'),
      { dedupeByUuid: true },
    )
    sources.push(meta)
  } catch (err) {
    sources.push({
      id: 'codex', name: 'Codex', kind: 'connected', status: 'error',
      sessionCount: 0, lastActivity: null,
      detail: '解析失败: ' + String(err && err.message).slice(0, 120), note: '',
    })
  }

  // DSH
  try {
    const state = { deadline: Date.now() + SOURCE_BUDGET_MS, truncated: false }
    const files = listFiles(
      [expandPath('~/.dsh/sessions')],
      (name) => name === 'session.jsonl.zstd',
      state,
    )
    let lastActivity = null
    let count = 0
    for (const f of files) {
      if (Date.now() > state.deadline) break
      const dirName = path.basename(path.dirname(path.dirname(f.path)))
      let session = cache ? cache.get(f.path, f.mtimeMs, f.size) : null
      if (session) {
        usedCache.hit += 1
      } else {
        usedCache.miss += 1
        try {
          session = await parseDshFile(f.path, decodeDshProject(dirName))
        } catch {
          session = null
        }
        if (session && cache) cache.put(f.path, f.mtimeMs, f.size, session)
      }
      if (session) {
        sessions.push(session)
        count += 1
        if (session.end && (!lastActivity || session.end > lastActivity)) {
          lastActivity = session.end
        }
      }
    }
    sources.push({
      id: 'dsh', name: 'DSH', kind: 'connected', status: 'connected',
      sessionCount: count, lastActivity, detail: '', note: '',
    })
  } catch (err) {
    sources.push({
      id: 'dsh', name: 'DSH', kind: 'connected', status: 'error',
      sessionCount: 0, lastActivity: null,
      detail: '解析失败: ' + String(err && err.message).slice(0, 120), note: '',
    })
  }

  // SQLite 源
  const sqliteSources = [
    {
      id: 'zcode',
      db: '~/.zcode/cli/db/db.sqlite',
      run: (p) => scanOpenCodeFamily('zcode', p, { tokensFromModelUsage: true }),
    },
    {
      id: 'opencode',
      db: '~/.local/share/opencode/opencode.db',
      run: (p) => scanOpenCodeFamily('opencode', p, { tokensFromModelUsage: false }),
    },
    { id: 'hermes', db: '~/.hermes/state.db', run: (p) => scanHermes(p) },
    { id: 'agnes', db: '~/.agnes/data/sessions/sessions.db', run: (p) => scanAgnes(p) },
  ]
  for (const src of sqliteSources) {
    const dbPath = expandPath(src.db)
    if (!fs.existsSync(dbPath)) {
      sources.push({
        id: src.id, name: TOOLS[src.id].name, kind: 'connected', status: 'absent',
        sessionCount: 0, lastActivity: null, detail: '未检测到本地数据库', note: '',
      })
      continue
    }
    try {
      const result = await src.run(dbPath)
      sessions.push(...result.sessions)
      let lastActivity = null
      for (const s of result.sessions) {
        if (s.end && (!lastActivity || s.end > lastActivity)) lastActivity = s.end
      }
      sources.push({
        id: src.id, name: TOOLS[src.id].name, kind: 'connected', status: 'connected',
        sessionCount: result.sessions.length, lastActivity,
        detail: result.note || '', note: '',
      })
    } catch (err) {
      sources.push({
        id: src.id, name: TOOLS[src.id].name, kind: 'connected', status: 'error',
        sessionCount: 0, lastActivity: null,
        detail: '解析失败: ' + String(err && err.message).slice(0, 120), note: '',
      })
    }
  }

  // 观察中源（含检测状态）
  for (const src of OBSERVING_SOURCES) {
    const detected = src.paths.some((p) => fs.existsSync(expandPath(p)))
    sources.push({
      id: src.id, name: src.name, kind: 'observing',
      status: detected ? 'observing' : 'absent',
      sessionCount: 0, lastActivity: null,
      detail: src.reason, note: '',
    })
  }

  if (cache) cache.save()

  sessions.sort((a, b) => (a.start || 0) - (b.start || 0))
  return {
    generatedAt: Date.now(),
    sessions,
    sources,
    cacheStats: usedCache,
  }
}

module.exports = { collectAll, TOOLS }
