// 日历视图的纯计算：按日索引 + 月格矩阵。不读时钟、不碰 DOM，便于单测。
import { dayKeyOf, sessionDurationMinutes } from './format'
import type { SessionRecord } from '../types'

export interface DayCell {
  dayKey: string
  count: number
  turns: number
  minutes: number
  /** 当天用过的软件颜色（按工具 id 去重后保序） */
  toolColors: string[]
}

export interface MonthCell {
  /** 空位（不属于本月的补格）为 null */
  dayKey: string | null
  inMonth: boolean
}

/**
 * 按日聚合。口径与清单视图的分日折叠完全一致：会话按 start 归日，
 * 没有 start 的（时间未记载）不进日历 —— 两个视图若给出不同的当日数字，用户无从判断哪个是真的。
 */
export function buildCalendarIndex(sessions: SessionRecord[]): Map<string, DayCell> {
  const map = new Map<string, DayCell>()
  for (const s of sessions) {
    if (!s.start) continue
    const dayKey = dayKeyOf(s.start)
    let cell = map.get(dayKey)
    if (!cell) {
      cell = { dayKey, count: 0, turns: 0, minutes: 0, toolColors: [] }
      map.set(dayKey, cell)
    }
    cell.count += 1
    cell.turns += s.turns
    cell.minutes += sessionDurationMinutes(s)
    if (s.toolColor && !cell.toolColors.includes(s.toolColor)) cell.toolColors.push(s.toolColor)
  }
  return map
}

/** 格子强度分档：0 无记录，1–3 递增。阈值按"一天几场会话"的实际分布取。 */
export function activityLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 6) return 2
  return 3
}

/** 6×7 月格，周一为首列；越界补位用 dayKey=null 标记，渲染成不可点的空格 */
export function buildMonthMatrix(year: number, month: number): MonthCell[] {
  const first = new Date(year, month - 1, 1)
  // getDay() 以周日为 0，转成周一为 0 的偏移
  const lead = (first.getDay() + 6) % 7
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month - 1, i - lead + 1)
    const inMonth = date.getMonth() === month - 1
    cells.push({ dayKey: inMonth ? dayKeyOf(date.getTime()) : null, inMonth })
  }
  return cells
}

export function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function monthLabel(year: number, month: number): string {
  return `${year} 年 ${month} 月`
}

/** 有记录的月份边界，用于禁用"翻到没有数据的月份"这种死路 */
export function monthRange(
  dayKeys: string[],
): { min: { year: number; month: number }; max: { year: number; month: number } } | null {
  let min: { year: number; month: number } | null = null
  let max: { year: number; month: number } | null = null
  for (const key of dayKeys) {
    const [y, m] = key.split('-').map(Number)
    if (!y || !m) continue
    const idx = y * 12 + m
    if (!min || idx < min.year * 12 + min.month) min = { year: y, month: m }
    if (!max || idx > max.year * 12 + max.month) max = { year: y, month: m }
  }
  return min && max ? { min, max } : null
}
