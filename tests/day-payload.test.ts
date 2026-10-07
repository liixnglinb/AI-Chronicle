import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface DayModule {
  MESSAGE_CLIP: number
  DAY_BUDGET: number
  clipMessage: (t: string) => string
  buildSummaryPrompt: (input: {
    dayKey: string
    stats: { count: number; turns: number; minutes: number; tools: string[]; artifacts?: number }
    items: Array<{
      tool: string
      toolName: string
      sessionId: string
      title: string
      texts: string[]
    }>
    unreadable?: Array<{ tool: string; toolName: string; reason: string }>
    truncated?: boolean
  }) => { system: string; user: string; meta: Record<string, unknown> }
  collectDayUserTexts: (options: {
    sessions: Array<{ id: string; tool: string; title: string }>
    cachePath: string | null
    crypto: unknown
    sqlitePaths?: Record<string, string>
    fileBudget?: number
    timeBudgetMs?: number
  }) => Promise<{
    items: Array<{
      tool: string
      toolName: string
      sessionId: string
      title: string
      texts: string[]
    }>
    unreadable: Array<{ tool: string; toolName: string; reason: string }>
    truncated: boolean
    filesRead: number
    ms: number
  }>
}

const { MESSAGE_CLIP, DAY_BUDGET, clipMessage, buildSummaryPrompt, collectDayUserTexts } =
  require('../electron/day-prompts.cjs') as DayModule
const { CACHE_VERSION } = require('../electron/ingest.cjs') as { CACHE_VERSION: number }

const item = (tool: string, texts: string[]) => ({
  tool,
  toolName: tool === 'claude-code' ? 'Claude Code' : tool,
  sessionId: `${tool}:s1`,
  title: '做一个页面',
  texts,
})

describe('clipMessage', () => {
  it('超过 200 字截断并加省略号', () => {
    const long = '字'.repeat(500)
    const out = clipMessage(long)
    expect(out.length).toBe(MESSAGE_CLIP + 1)
    expect(out.endsWith('…')).toBe(true)
  })
  it('换行压成一行，短文本原样', () => {
    expect(clipMessage('第一行\n第二行')).toBe('第一行 第二行')
    expect(clipMessage('  正好  ')).toBe('正好')
  })
})

describe('buildSummaryPrompt', () => {
  const stats = { count: 2, turns: 9, minutes: 120, tools: ['Claude Code'], artifacts: 3 }

  it('开头是可核对的本地事实，且明确声明材料边界', () => {
    const { system, user } = buildSummaryPrompt({ dayKey: '2026-10-07', stats, items: [] })
    expect(user).toContain('日期：2026-10-07')
    expect(user).toContain('会话 2 场 · 交互 9 轮 · 活跃时长 120 分钟')
    expect(user).toContain('产出文件：3 个')
    expect(system).toContain('不得编造')
  })

  it('只纳入用户消息，模型回复根本不在输入里', () => {
    const { user } = buildSummaryPrompt({
      dayKey: '2026-10-07',
      stats,
      items: [item('claude-code', ['帮我改一下下载页'])],
    })
    expect(user).toContain('帮我改一下下载页')
    // 断言提示词里没有 assistant 角色内容：构造器压根不接收这类字段
    expect(user).not.toMatch(/assistant|模型回复/)
  })

  it('日预算兜底：超出的条数如实报告，不静默丢', () => {
    const many = Array.from({ length: 300 }, (_, i) => `第 ${i} 条消息 ` + '内'.repeat(190))
    const { user, meta } = buildSummaryPrompt({
      dayKey: '2026-10-07',
      stats,
      items: item('claude-code', many) ? [item('claude-code', many)] : [],
    })
    expect(user.length).toBeLessThanOrEqual(DAY_BUDGET + 600)
    expect(meta.budgetHit).toBe(true)
    expect(meta.omittedMessages).toBeGreaterThan(0)
    expect(user).toContain(`另有 ${meta.omittedMessages} 条超出`)
  })

  it('发送前逐条脱敏', () => {
    const { user } = buildSummaryPrompt({
      dayKey: '2026-10-07',
      stats,
      items: [item('claude-code', ['我的 key 是 sk-abcd1234EFGH5678，帮我看看'])],
    })
    expect(user).not.toContain('sk-abcd1234EFGH5678')
    expect(user).toContain('[已脱敏密钥]')
  })

  it('没取到正文的来源被点名，而不是假装完整', () => {
    const { user } = buildSummaryPrompt({
      dayKey: '2026-10-07',
      stats,
      items: [],
      unreadable: [{ tool: 'hermes', toolName: 'Hermes', reason: '本机没有该数据库文件' }],
      truncated: true,
    })
    expect(user).toContain('Hermes（本机没有该数据库文件）')
    expect(user).toContain('可能不完整')
  })
})

describe('collectDayUserTexts（真实缓存 + 真实 jsonl）', () => {
  let dir = ''
  let cachePath = ''
  let sessionFile = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'day-prompts-'))
    const projectDir = join(dir, 'projects', 'demo-project')
    mkdirSync(projectDir, { recursive: true })
    sessionFile = join(projectDir, 'sess-1.jsonl')
    const lines = [
      {
        type: 'user',
        timestamp: '2026-10-07T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '把下载页的版本号改成 0.7.0' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-10-07T01:01:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '模型回复：已经改好了，别发出去' }],
        },
      },
      {
        type: 'user',
        timestamp: '2026-10-07T01:02:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: '再跑一次构建' }] },
      },
      {
        type: 'user',
        isMeta: true,
        timestamp: '2026-10-07T01:03:00.000Z',
        message: { role: 'user', content: 'Caveat: 系统注入的提示，不该外发' },
      },
    ]
    writeFileSync(sessionFile, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
    cachePath = join(dir, 'chronicle-ingest-cache.json')
    writeFileSync(
      cachePath,
      JSON.stringify({
        v: CACHE_VERSION,
        files: {
          [sessionFile.replace(/\\/g, '/')]: {
            m: 1,
            s: 1,
            session: { id: 'claude-code:sess-1', tool: 'claude-code', start: 1, end: 2, turns: 2 },
          },
          [join(dir, 'missing.jsonl').replace(/\\/g, '/')]: {
            m: 1,
            s: 1,
            session: { id: 'claude-code:gone', tool: 'claude-code', start: 1, end: 2, turns: 1 },
          },
        },
      }),
      'utf8',
    )
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('按缓存里的路径重读原文，只取用户消息', async () => {
    const r = await collectDayUserTexts({
      sessions: [{ id: 'claude-code:sess-1', tool: 'claude-code', title: '把下载页' }],
      cachePath,
      crypto: null,
    })
    const texts = r.items[0]?.texts ?? []
    expect(texts.some((t) => t.includes('把下载页的版本号改成 0.7.0'))).toBe(true)
    expect(texts.some((t) => t.includes('再跑一次构建'))).toBe(true)
    expect(r.items[0].texts.join('\n')).not.toContain('模型回复')
    expect(r.items[0].texts.join('\n')).not.toContain('系统注入的提示')
  })

  it('文件已被删除的会话进 unreadable，不影响其它会话', async () => {
    const r = await collectDayUserTexts({
      sessions: [
        { id: 'claude-code:sess-1', tool: 'claude-code', title: 'a' },
        { id: 'claude-code:gone', tool: 'claude-code', title: 'b' },
      ],
      cachePath,
      crypto: null,
    })
    expect(r.items).toHaveLength(1)
    expect(r.unreadable[0].tool).toBe('claude-code')
    expect(r.unreadable[0].reason).toContain('1 场会话')
  })

  it('缓存不可用时明确报因，不静默返回空', async () => {
    const r = await collectDayUserTexts({
      sessions: [{ id: 'claude-code:sess-1', tool: 'claude-code', title: 'a' }],
      cachePath: join(dir, 'no-such-cache.json'),
      crypto: null,
    })
    expect(r.items).toHaveLength(0)
    expect(r.unreadable[0].reason).toContain('缓存索引')
  })

  it('文件数预算卡住时 truncated=true', async () => {
    const r = await collectDayUserTexts({
      sessions: [
        { id: 'claude-code:sess-1', tool: 'claude-code', title: 'a' },
        { id: 'claude-code:gone', tool: 'claude-code', title: 'b' },
      ],
      cachePath,
      crypto: null,
      fileBudget: 0,
    })
    expect(r.truncated).toBe(true)
    expect(r.items).toHaveLength(0)
  })

  it('未知来源（既非文件源也没有数据库路径）如实标注', async () => {
    const r = await collectDayUserTexts({
      sessions: [{ id: 'hermes:9', tool: 'hermes', title: 'a' }],
      cachePath,
      crypto: null,
      sqlitePaths: {},
    })
    expect(r.unreadable[0].toolName).toBe('Hermes')
    expect(r.unreadable[0].reason).toContain('数据库')
  })
})
