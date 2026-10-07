'use strict'
// 当天"用户自己发出去的消息"摘录 + 发给模型的提示词构造。
//
// 为什么单独一个文件而不是改采集：正文只在这一条按需路径上读，
// 采集缓存（chronicle-ingest-cache.json）里始终不存正文，
// 否则缓存体积随会话量成倍涨，等于把全部对话再抄一份落盘。
//
// SQLite 源的表结构在这里重复了一份（zcode/opencode/hermes/agnes），是有意的取舍：
// 动 ingest.cjs 的扫描函数会让采集路径承担回归风险，而这条路径读不到只是"总结少几个来源"，
// 且少哪些来源会如实显示在「发送内容预览」里，不会静默。

const fs = require('node:fs')
const path = require('node:path')

const {
  IngestCache,
  parseClaudeLikeFile,
  parseCodexFile,
  parseDshFile,
  TOOLS,
} = require('./ingest.cjs')
const { redactSecrets } = require('./ai-client.cjs')

const MESSAGE_CLIP = 200
const DAY_BUDGET = 24_000
const FILE_BUDGET = 120
const TIME_BUDGET_MS = 8_000

/** 走文件重读的 jsonl / zstd 源 → 用哪个解析器 */
const FILE_PARSERS = {
  'claude-code': (p) =>
    parseClaudeLikeFile('claude-code', p, path.basename(path.dirname(p)), { userTexts: true }),
  workbuddy: (p) =>
    parseClaudeLikeFile('workbuddy', p, path.basename(path.dirname(p)), { userTexts: true }),
  'workbuddy-ai': (p) =>
    parseClaudeLikeFile('workbuddy-ai', p, path.basename(path.dirname(p)), { userTexts: true }),
  catpaw: (p) =>
    parseClaudeLikeFile('catpaw', p, path.basename(path.dirname(p)), { userTexts: true }),
  mhagent: (p) =>
    parseClaudeLikeFile('mhagent', p, path.basename(path.dirname(p)), { userTexts: true }),
  modex: (p) =>
    parseClaudeLikeFile('modex', p, path.basename(path.dirname(p)), { userTexts: true }),
  codex: (p) => parseCodexFile(p, { userTexts: true }),
  dsh: (p) => parseDshFile(p, '', { userTexts: true }),
}

const SQLITE_QUERIES = {
  hermes: {
    sql: "SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY timestamp ASC",
    column: 'content',
  },
  agnes: {
    sql: "SELECT content_json FROM messages WHERE session_id = ? AND role = 'user' ORDER BY timestamp ASC",
    column: 'content_json',
  },
}

function unwrapText(value) {
  if (typeof value !== 'string') return ''
  let text = value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      text = parsed
        .filter((x) => x && (x.type === 'text' || typeof x.text === 'string'))
        .map((x) => x.text)
        .filter(Boolean)
        .join('\n')
    } else if (parsed && typeof parsed.text === 'string') {
      text = parsed.text
    }
  } catch {
    /* 本来就是纯文本 */
  }
  return String(text).replace(/\s+/g, ' ').trim()
}

/** opencode / zcode：message 表定角色，part 表定正文 */
function readOpenCodeFamily(dbPath, sessionIds) {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const out = new Map()
  try {
    const msgRows = db
      .prepare('SELECT id, session_id, data FROM message ORDER BY time_created ASC')
      .all()
    const wanted = new Set(sessionIds)
    const idsBySession = new Map()
    for (const row of msgRows) {
      if (!wanted.has(row.session_id)) continue
      let role = ''
      try {
        role = JSON.parse(row.data || '')?.role
      } catch {
        role = ''
      }
      if (role !== 'user') continue
      if (!idsBySession.has(row.session_id)) idsBySession.set(row.session_id, [])
      idsBySession.get(row.session_id).push(row.id)
    }
    const wantedMsgIds = new Set([...idsBySession.values()].flat())
    if (!wantedMsgIds.size) return out
    const partRows = db
      .prepare('SELECT message_id, data FROM part WHERE data LIKE \'%"type":"text"%\'')
      .all()
    const partsByMsg = new Map()
    for (const pr of partRows) {
      if (!wantedMsgIds.has(pr.message_id)) continue
      if (!partsByMsg.has(pr.message_id)) partsByMsg.set(pr.message_id, [])
      partsByMsg.get(pr.message_id).push(pr)
    }
    for (const [sid, msgIds] of idsBySession) {
      const texts = []
      for (const mid of msgIds) {
        const parts = partsByMsg.get(mid) || []
        for (const pr of parts) {
          try {
            const data = JSON.parse(pr.data)
            if (data && data.type === 'text' && typeof data.text === 'string') {
              const cleaned = data.text.replace(/\s+/g, ' ').trim()
              if (cleaned) texts.push(cleaned)
            }
          } catch {
            /* 非 JSON part 忽略 */
          }
        }
      }
      if (texts.length) out.set(sid, texts)
    }
  } finally {
    try {
      db.close()
    } catch {
      /* 忽略 */
    }
  }
  return out
}

function readSqliteGeneric(dbPath, sessionIds, query) {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const out = new Map()
  try {
    const stmt = db.prepare(query.sql)
    for (const sid of sessionIds) {
      const rows = stmt.all(sid)
      const texts = []
      for (const row of rows) {
        const cleaned = unwrapText(row[query.column])
        if (cleaned) texts.push(cleaned)
      }
      if (texts.length) out.set(sid, texts)
    }
  } finally {
    try {
      db.close()
    } catch {
      /* 忽略 */
    }
  }
  return out
}

/**
 * 主入口：给定当天的会话（已由采集结果筛出），取回每条会话里用户发出的原文。
 * 返回里如实标出哪些来源没取到，界面据此显示"本次发送内容"而不是假装全都有。
 */
async function collectDayUserTexts(options) {
  const {
    sessions,
    cachePath,
    crypto,
    sqlitePaths = {},
    fsImpl = fs,
    fileBudget = FILE_BUDGET,
    timeBudgetMs = TIME_BUDGET_MS,
  } = options
  const started = Date.now()
  const items = []
  const unreadable = []
  let filesRead = 0
  let truncated = false

  const byTool = new Map()
  for (const s of sessions) {
    if (!s.tool) continue
    if (!byTool.has(s.tool)) byTool.set(s.tool, [])
    byTool.get(s.tool).push(s)
  }

  // 文件路径来自采集缓存的键，不需要重新枚举目录
  let pathById = null
  const needsPathIndex = [...byTool.keys()].some((t) => FILE_PARSERS[t])
  if (needsPathIndex && cachePath && fsImpl.existsSync(cachePath)) {
    try {
      const cache = new IngestCache(cachePath, crypto)
      pathById = new Map()
      for (const [filePath, entry] of Object.entries(cache.data?.files || {})) {
        const id = entry?.session?.id
        if (id && !pathById.has(id)) pathById.set(id, filePath)
      }
    } catch {
      pathById = null
    }
  }

  for (const [tool, list] of byTool) {
    const toolName = TOOLS[tool]?.name || tool
    if (FILE_PARSERS[tool]) {
      if (!pathById) {
        unreadable.push({ tool, toolName, reason: '读不到本机采集缓存索引' })
        continue
      }
      const missing = []
      for (const s of list) {
        if (Date.now() - started > timeBudgetMs) {
          truncated = true
          break
        }
        if (filesRead >= fileBudget) {
          truncated = true
          break
        }
        const filePath = pathById.get(s.id)
        if (!filePath || !fsImpl.existsSync(filePath)) {
          missing.push(s.id)
          continue
        }
        filesRead += 1
        let parsed = null
        try {
          parsed = await FILE_PARSERS[tool](filePath)
        } catch {
          missing.push(s.id)
          continue
        }
        const texts = Array.isArray(parsed?.userTexts) ? parsed.userTexts : []
        if (texts.length) items.push({ tool, toolName, sessionId: s.id, title: s.title, texts })
        else missing.push(s.id)
      }
      if (missing.length) {
        unreadable.push({
          tool,
          toolName,
          reason: `${missing.length} 场会话没找到原文（文件已移动/删除，或超出 ${fileBudget} 文件/${Math.round(timeBudgetMs / 1000)} 秒预算）`,
        })
      }
      continue
    }

    const dbPath = sqlitePaths[tool]
    if (!dbPath || !fsImpl.existsSync(dbPath)) {
      unreadable.push({ tool, toolName, reason: '本机没有该数据库文件' })
      continue
    }
    const ids = list.map((s) => String(s.id).split(':').slice(1).join(':'))
    try {
      let found
      if (tool === 'opencode' || tool === 'zcode') found = readOpenCodeFamily(dbPath, ids)
      else if (SQLITE_QUERIES[tool]) found = readSqliteGeneric(dbPath, ids, SQLITE_QUERIES[tool])
      else {
        unreadable.push({ tool, toolName, reason: '该来源暂不支持正文摘录' })
        continue
      }
      let hit = 0
      for (const s of list) {
        const key = String(s.id).split(':').slice(1).join(':')
        const texts = found.get(key)
        if (texts && texts.length) {
          hit += 1
          items.push({ tool, toolName, sessionId: s.id, title: s.title, texts })
        }
      }
      if (hit < list.length) {
        unreadable.push({
          tool,
          toolName,
          reason: `${list.length - hit} 场会话没查到正文（数据库结构或权限）`,
        })
      }
    } catch (err) {
      unreadable.push({
        tool,
        toolName,
        reason: String(err && err.message).slice(0, 80),
      })
    }
  }

  return { items, unreadable, truncated, filesRead, ms: Date.now() - started }
}

function clipMessage(text) {
  const one = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (one.length <= MESSAGE_CLIP) return one
  return `${one.slice(0, MESSAGE_CLIP)}…`
}

/**
 * 组装发给模型的文本。顺序：先本地可核对的事实，再用户原话摘录。
 * 每条截 200 字、全天 24000 字兜底，超出的条数如实写进"未纳入"，不静默丢弃。
 */
function buildSummaryPrompt({ dayKey, stats, items, unreadable = [], truncated = false }) {
  const lines = []
  lines.push(`日期：${dayKey}`)
  lines.push(
    `本地统计：会话 ${stats.count} 场 · 交互 ${stats.turns} 轮 · 活跃时长 ${stats.minutes} 分钟 · 涉及软件 ${stats.tools.join('、') || '（无）'}`,
  )
  if (stats.artifacts) lines.push(`产出文件：${stats.artifacts} 个`)

  let used = lines.join('\n').length
  const included = []
  let omittedMessages = 0
  let omittedChars = 0
  let budgetHit = false

  for (const item of items) {
    for (const raw of item.texts) {
      const text = redactSecrets(clipMessage(raw))
      if (!text) continue
      const cost = text.length + 8
      if (used + cost > DAY_BUDGET) {
        budgetHit = true
        omittedMessages += 1
        omittedChars += text.length
        continue
      }
      used += cost
      included.push({ tool: item.toolName, title: item.title, text })
    }
  }

  lines.push('')
  lines.push('当天我发出的消息（每条最多 200 字，已做本机脱敏）：')
  let lastTool = ''
  for (const entry of included) {
    if (entry.tool !== lastTool) {
      lines.push(`【${entry.tool}】${entry.title ? ` ${entry.title}` : ''}`)
      lastTool = entry.tool
    }
    lines.push(`- ${entry.text}`)
  }
  if (budgetHit) {
    lines.push('')
    lines.push(`（另有 ${omittedMessages} 条超出 ${DAY_BUDGET} 字/天的预算，未纳入）`)
  }
  if (unreadable.length) {
    lines.push('')
    lines.push(
      '未取到原文的来源：' + unreadable.map((u) => `${u.toolName}（${u.reason}）`).join('；'),
    )
  }
  if (truncated) lines.push('注：本次读取受文件数/时间预算限制，可能不完整。')

  const user = lines.join('\n')
  return {
    system:
      '你是工作总结助手。只依据用户提供的本机使用记录做归纳，不得编造未在材料中出现的事实；' +
      '材料里没有的信息就直接说没有。输出中文，300 字以内，先一句话概述，再列 3–6 条要点（要点写"做了什么/结果是什么"，不写空话）。',
    user,
    meta: {
      includedMessages: included.length,
      omittedMessages,
      omittedChars,
      chars: user.length,
      budgetHit,
      truncated,
      unreadable,
    },
  }
}

module.exports = {
  MESSAGE_CLIP,
  DAY_BUDGET,
  FILE_BUDGET,
  TIME_BUDGET_MS,
  collectDayUserTexts,
  buildSummaryPrompt,
  clipMessage,
  unwrapText,
}
