import { describe, expect, it } from 'vitest'
import {
  activityLevel,
  buildCalendarIndex,
  buildMonthMatrix,
  monthRange,
  shiftMonth,
} from '../src/lib/calendar'
import { dayKeyOf } from '../src/lib/format'
import type { SessionRecord } from '../src/types'

/** 用本地时间构造时间戳：dayKeyOf 也是本地口径，测试因此与运行时区无关 */
function at(y: number, m: number, d: number, hh = 9, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0).getTime()
}

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'claude-code:1',
    tool: 'claude-code',
    toolName: 'Claude Code',
    toolColor: '#D97757',
    title: '重构下载页',
    project: 'voyra-site',
    projectPath: 'D:/work/voyra-site',
    start: at(2026, 10, 7),
    end: at(2026, 10, 7, 10, 30),
    turns: 4,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
    model: 'gpt-5-codex',
    hasTokens: false,
    artifacts: [],
    ...over,
  } as SessionRecord
}

describe('buildCalendarIndex', () => {
  it('按 start 归日，聚合会话数/轮次/时长', () => {
    const cells = buildCalendarIndex([
      session({ id: 'a', start: at(2026, 10, 7), end: at(2026, 10, 7, 10), turns: 3 }),
      session({ id: 'b', start: at(2026, 10, 7, 14), end: at(2026, 10, 7, 15), turns: 5 }),
      session({ id: 'c', start: at(2026, 10, 6, 9), end: at(2026, 10, 6, 9, 40), turns: 2 }),
    ])
    expect(cells.get('2026-10-07')).toMatchObject({ count: 2, turns: 8, minutes: 120 })
    expect(cells.get('2026-10-06')).toMatchObject({ count: 1, turns: 2, minutes: 40 })
  })

  it('没有 start 的会话不进日历，与清单的「时间未记载」分桶不混在一起', () => {
    const cells = buildCalendarIndex([session({ start: null, end: null })])
    expect(cells.size).toBe(0)
  })

  it('跨零点的会话只算开始那天（与清单分日同一口径）', () => {
    const cells = buildCalendarIndex([
      session({ start: at(2026, 10, 7, 23), end: at(2026, 10, 8, 1) }),
    ])
    expect([...cells.keys()]).toEqual(['2026-10-07'])
  })

  it('工具色点按颜色去重且保序', () => {
    const cells = buildCalendarIndex([
      session({ id: 'a', toolColor: '#D97757' }),
      session({ id: 'b', toolColor: '#D97757' }),
      session({ id: 'c', toolColor: '#10B981', start: at(2026, 10, 7, 11) }),
    ])
    expect(cells.get('2026-10-07')?.toolColors).toEqual(['#D97757', '#10B981'])
  })

  it('时长缺失（end<=start）记 0 分钟而不是负数', () => {
    const cells = buildCalendarIndex([session({ start: at(2026, 10, 7), end: at(2026, 10, 7) })])
    expect(cells.get('2026-10-07')?.minutes).toBe(0)
  })

  it('dayKey 与 dayKeyOf 一致，两个视图不会出现同一天两个键', () => {
    const t = at(2026, 3, 9, 23, 59)
    expect([...buildCalendarIndex([session({ start: t, end: null })]).keys()]).toEqual([
      dayKeyOf(t),
    ])
  })
})

describe('activityLevel', () => {
  it('0/1-2/3-6/7+ 四档', () => {
    expect([0, 1, 2, 3, 6, 7, 40].map(activityLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })
})

describe('buildMonthMatrix', () => {
  it('固定 42 格、周一为首列', () => {
    const m = buildMonthMatrix(2026, 10)
    expect(m).toHaveLength(42)
    // 2026-10-01 是周四 → 前面补 3 个空格
    expect(m.slice(0, 3).every((c) => c.dayKey === null)).toBe(true)
    expect(m[3]).toEqual({ dayKey: '2026-10-01', inMonth: true })
  })

  it('行首恒为周一：每行第 0 格的日号 mod 7 递增', () => {
    const m = buildMonthMatrix(2026, 10)
    const firsts = [0, 7, 14, 21, 28, 35].map((i) => m[i])
    const keys = firsts.filter((c) => c.dayKey).map((c) => Number(c.dayKey!.slice(8)))
    for (let i = 1; i < keys.length; i++) expect(keys[i] - keys[i - 1]).toBe(7)
  })

  it('月末之后的补格为 null，不混入下月日期', () => {
    const m = buildMonthMatrix(2026, 10)
    const inMonth = m.filter((c) => c.inMonth)
    expect(inMonth.map((c) => c.dayKey)).toEqual(
      Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
    )
    expect(m.filter((c) => c.dayKey === null).length).toBe(42 - 31)
  })

  it('闰年 2 月给出 29 天', () => {
    expect(buildMonthMatrix(2024, 2).filter((c) => c.inMonth)).toHaveLength(29)
    expect(buildMonthMatrix(2026, 2).filter((c) => c.inMonth)).toHaveLength(28)
  })

  it('inMonth=false 的格子一定没有 dayKey（渲染成不可点空格）', () => {
    for (const c of buildMonthMatrix(2026, 11)) {
      if (!c.inMonth) expect(c.dayKey).toBeNull()
    }
  })
})

describe('shiftMonth', () => {
  it('跨年回绕', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 10, 0)).toEqual({ year: 2026, month: 10 })
  })

  it('跨多年', () => {
    expect(shiftMonth(2026, 10, 24)).toEqual({ year: 2028, month: 10 })
    expect(shiftMonth(2026, 10, -30)).toEqual({ year: 2024, month: 4 })
  })
})

describe('monthRange', () => {
  it('给出有记录的月份边界，供翻页按钮禁用', () => {
    const r = monthRange(['2026-10-07', '2026-01-03', '2025-12-31', '2026-10-01'])
    expect(r).toEqual({ min: { year: 2025, month: 12 }, max: { year: 2026, month: 10 } })
  })

  it('空输入返回 null（界面据此不禁用翻页）', () => {
    expect(monthRange([])).toBeNull()
  })

  it('脏键忽略而不是 NaN 传染', () => {
    expect(monthRange(['unknown', '2026-10-07'])).toEqual({
      min: { year: 2026, month: 10 },
      max: { year: 2026, month: 10 },
    })
  })
})
