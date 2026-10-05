import { describe, expect, it } from 'vitest'
import { buildDailyReport, buildWorkSummary } from '../src/lib/summary'

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime()

function session(overrides: Partial<IngestSession> = {}): IngestSession {
  return {
    id: 's1',
    tool: 'claude',
    toolName: 'Claude Code',
    toolColor: '#123456',
    title: '示例会话',
    project: 'app',
    projectPath: 'C:\\work\\app',
    start: at(2026, 10, 2, 9, 0),
    end: at(2026, 10, 2, 10, 0),
    turns: 3,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
    model: 'sonnet',
    hasTokens: false,
    artifacts: [],
    ...overrides,
  }
}

describe('buildWorkSummary', () => {
  it('按工作目录归组并累加会话数与轮次', () => {
    const result = buildWorkSummary([
      session({ id: 'a', turns: 2 }),
      session({ id: 'b', turns: 5, start: at(2026, 10, 2, 14, 0) }),
      session({ id: 'c', project: 'other', projectPath: 'C:\\work\\other', turns: 1 }),
    ])

    expect(result).toHaveLength(2)
    const app = result.find((item) => item.path === 'C:\\work\\app')!
    expect(app.count).toBe(2)
    expect(app.turns).toBe(7)
  })

  it('时间取最早开始与最晚结束', () => {
    const result = buildWorkSummary([
      session({ id: 'a', start: at(2026, 10, 2, 14, 0), end: at(2026, 10, 2, 15, 0) }),
      session({ id: 'b', start: at(2026, 10, 2, 9, 0), end: at(2026, 10, 2, 10, 0) }),
    ])
    expect(result[0].first).toBe(at(2026, 10, 2, 9, 0))
    expect(result[0].last).toBe(at(2026, 10, 2, 15, 0))
  })

  it('结束时间缺失时回退到开始时间', () => {
    const result = buildWorkSummary([session({ start: at(2026, 10, 2, 9, 0), end: null })])
    expect(result[0].last).toBe(at(2026, 10, 2, 9, 0))
  })

  it('合并同一目录下的多个软件且不重复', () => {
    const result = buildWorkSummary([
      session({ id: 'a', tool: 'claude', toolName: 'Claude Code' }),
      session({ id: 'b', tool: 'codex', toolName: 'Codex' }),
      session({ id: 'c', tool: 'claude', toolName: 'Claude Code' }),
    ])
    expect(result[0].tools).toEqual(['Claude Code', 'Codex'])
  })

  it('产出文件按名称去重，并统计总处理次数', () => {
    const result = buildWorkSummary([
      session({
        id: 'a',
        artifacts: [
          { name: 'index.tsx', path: 'C:\\work\\app\\index.tsx', size: 10, mtime: 1 },
          { name: 'readme.md', path: 'C:\\work\\app\\readme.md', size: 10, mtime: 1 },
        ],
      }),
      session({
        id: 'b',
        artifacts: [{ name: 'index.tsx', path: 'C:\\work\\app\\index.tsx', size: 10, mtime: 2 }],
      }),
    ])
    expect(result[0].artifactCount).toBe(3)
    expect(result[0].artifactNames).toEqual(['index.tsx', 'readme.md'])
  })

  it('依据产出文件类型推导工作焦点', () => {
    const result = buildWorkSummary([
      session({
        artifacts: [
          { name: 'App.tsx', path: 'p/App.tsx', size: 1, mtime: 1 },
          { name: 'config.json', path: 'p/config.json', size: 1, mtime: 1 },
        ],
      }),
    ])
    expect(result[0].focus).toBe('界面与代码、配置与数据')
  })

  it('没有产出时按轮次给出兜底描述', () => {
    expect(buildWorkSummary([session({ turns: 10 })])[0].focus).toBe('方案讨论与问题排查')
    expect(buildWorkSummary([session({ turns: 1 })])[0].focus).toBe('轻量协作与信息整理')
  })

  it('按最近活动时间倒序排列', () => {
    const result = buildWorkSummary([
      session({
        id: 'old',
        projectPath: 'C:\\old',
        start: at(2026, 10, 1, 9, 0),
        end: at(2026, 10, 1, 10, 0),
      }),
      session({
        id: 'new',
        projectPath: 'C:\\new',
        start: at(2026, 10, 2, 9, 0),
        end: at(2026, 10, 2, 10, 0),
      }),
    ])
    expect(result.map((item) => item.path)).toEqual(['C:\\new', 'C:\\old'])
  })

  it('缺少 project 时用目录名兜底', () => {
    const result = buildWorkSummary([
      session({ project: '', projectPath: 'C:\\work\\my-app' }),
      session({ id: 'x', project: '', projectPath: '' }),
    ])
    const paths = result.map((item) => item.project)
    expect(paths).toContain('my-app')
    expect(paths).toContain('(未知目录)')
  })

  it('按软件归组时同一软件的多个目录合并成一条', () => {
    const result = buildWorkSummary(
      [
        session({ id: 'a', tool: 'claude', toolName: 'Claude Code', turns: 2 }),
        session({
          id: 'b',
          tool: 'claude',
          toolName: 'Claude Code',
          project: 'other',
          projectPath: 'C:\\work\\other',
          turns: 5,
        }),
        session({ id: 'c', tool: 'codex', toolName: 'Codex', turns: 1 }),
      ],
      'tool',
    )

    expect(result).toHaveLength(2)
    const claude = result.find((item) => item.project === 'Claude Code')!
    expect(claude.count).toBe(2)
    expect(claude.turns).toBe(7)
  })

  it('按软件归组不产出任何目录字段（界面与日报都无路径可显示）', () => {
    const result = buildWorkSummary([session(), session({ id: 'b', tool: 'codex' })], 'tool')
    expect(result.every((item) => item.path === '')).toBe(true)
    expect(result.map((item) => item.key)).toEqual(['claude', 'codex'])
  })

  it('空输入返回空数组', () => {
    expect(buildWorkSummary([])).toEqual([])
  })
})

describe('buildDailyReport', () => {
  const now = at(2026, 10, 2, 18, 0)

  it('开头一句话总览 + 概览表 + 会话表（用真实标题而非套话）', () => {
    const md = buildDailyReport([session()], now)
    expect(md).toContain('# AI 工作日报 · 2026-10-02')
    expect(md).toContain('今天在 1 个目录用了 1 个软件，完成 1 个会话、3 轮对话，')
    expect(md).toContain('## 概览')
    expect(md).toContain('| 会话 | 1 个 |')
    expect(md).toContain('| 对话轮次 | 3 轮 |')
    expect(md).toContain('| 活跃时段 | 09:00 – 10:00（跨度 1 小时） |')
    expect(md).toContain('| 时间 | 软件 | 做了什么 | 轮次 |')
    // 「做了什么」必须是真实会话标题，而不是「处理 N 个产出文件」这类套话
    expect(md).toContain('| 09:00 – 10:00 | Claude Code | 示例会话 | 3 |')
  })

  it('标题缺失时退回按产出文件描述', () => {
    const md = buildDailyReport(
      [
        session({
          title: '',
          artifacts: [{ name: 'a.ts', path: 'C:////work////app////a.ts', size: 1, mtime: 1 }],
        }),
      ],
      now,
    )
    expect(md).toContain('处理 1 个产出文件')
  })

  it('过长的标题截断到 64 字以内，不撑成流水账', () => {
    const md = buildDailyReport([session({ title: 'あ'.repeat(200) })], now)
    const row = md.split('\n').find((line) => line.startsWith('| 09:00')) ?? ''
    const cell = row.split('|')[3]?.trim() ?? ''
    expect(cell.length).toBeLessThanOrEqual(64)
    expect(cell.endsWith('…')).toBe(true)
  })

  it('按项目分段归纳，并标注会话数、轮次与时间窗', () => {
    const md = buildDailyReport(
      [
        session({ id: 'a', start: at(2026, 10, 2, 9, 0), end: at(2026, 10, 2, 10, 0) }),
        session({ id: 'b', project: 'web', projectPath: 'C:////work////web', toolName: 'Codex' }),
      ],
      now,
    )
    expect(md).toContain('## 做了什么')
    expect(md).toContain('### app · Claude Code · 1 会话 · 3 轮 · 09:00–10:00')
    expect(md).toContain('### web · Codex · 1 会话 · 3 轮')
  })

  it('产出按类型归类，超出 8 个时截断并注明剩余数量', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      name: `f${i}.ts`,
      path: `C:////work////app////f${i}.ts`,
      size: 1,
      mtime: 1,
    }))
    const md = buildDailyReport([session({ artifacts: many })], now)
    expect(md).toContain('## 产出文件')
    expect(md).toContain('- **界面与代码**（12）：')
    expect(md).toContain('还有 4 个')
    expect(md).toContain('| 产出文件 | 12 个（界面与代码 12） |')
  })

  it('产出路径相对项目根目录缩写，不输出长绝对路径', () => {
    const md = buildDailyReport(
      [
        session({
          artifacts: [
            { name: 'a.ts', path: 'C:////work////app////src////a.ts', size: 1, mtime: 1 },
          ],
        }),
      ],
      now,
    )
    expect(md).toContain('src/a.ts')
    expect(md).not.toContain('C:////work////app////src////a.ts')
  })

  it('项目超过 12 个会话时只列前 12 条并提示见完整清单', () => {
    const many = Array.from({ length: 15 }, (_, i) => session({ id: `s${i}`, turns: 1 }))
    const md = buildDailyReport(many, now)
    expect(md).toContain('其余 3 个会话见下方完整清单')
    // 完整清单仍然包含全部 15 条
    const rows = md.split('\n').filter((line) => line.startsWith('| 09:00'))
    expect(rows).toHaveLength(15)
  })

  it('没有产出时不输出产出章节', () => {
    expect(buildDailyReport([session()], now)).not.toContain('## 产出文件')
  })

  it('按软件归组的日报：总览改说软件、分段标题不再重复工具名、正文无目录', () => {
    const md = buildDailyReport(
      [
        session({ id: 'a', toolName: 'Claude Code' }),
        session({
          id: 'b',
          tool: 'codex',
          toolName: 'Codex',
          project: 'other',
          projectPath: 'C:\\work\\other',
        }),
      ],
      now,
      'tool',
    )
    expect(md).toContain('今天在 2 款 AI 软件里完成 2 个会话')
    expect(md).toContain('### Claude Code · 1 会话')
    expect(md).toContain('### Codex · 1 会话')
    expect(md).not.toContain('C:\\work')
  })

  it('空输入给出一句话说明而不是空表格', () => {
    const md = buildDailyReport([], now)
    expect(md).toContain('# AI 工作日报 · 2026-10-02')
    expect(md).toContain('今天没有检测到 AI 会话记录。')
    expect(md).not.toContain('## 概览')
  })
})
