import { describe, expect, it } from 'vitest'
import {
  dayKeyOf,
  formatClock,
  formatDayLabel,
  formatDayLabelShort,
  formatDuration,
  formatSessionTime,
  formatTimeRange,
  sessionDurationMinutes,
  sessionTouchesDay,
  shortenPath,
} from '../src/lib/format'

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime()

describe('formatClock', () => {
  it('补零到两位', () => {
    expect(formatClock(at(2026, 10, 2, 9, 5))).toBe('09:05')
    expect(formatClock(at(2026, 10, 2, 23, 59))).toBe('23:59')
    expect(formatClock(at(2026, 10, 2, 0, 0))).toBe('00:00')
  })
})

describe('formatTimeRange', () => {
  it('缺少开始时间时返回占位符', () => {
    expect(formatTimeRange(null, null)).toBe('--:--')
    expect(formatTimeRange(null, at(2026, 10, 2, 10, 0))).toBe('--:--')
  })

  it('同一自然日使用短横线连接', () => {
    expect(formatTimeRange(at(2026, 10, 2, 9, 5), at(2026, 10, 2, 11, 30))).toBe('09:05 – 11:30')
  })

  it('起止相同或缺失结束时间时只显示起点', () => {
    const t = at(2026, 10, 2, 9, 5)
    expect(formatTimeRange(t, t)).toBe('09:05')
    expect(formatTimeRange(t, null)).toBe('09:05')
  })

  it('跨零点时带上日期，避免歧义', () => {
    expect(formatTimeRange(at(2026, 10, 1, 23, 40), at(2026, 10, 2, 1, 20))).toBe(
      '10/1 23:40 → 10/2 01:20',
    )
  })
})

describe('dayKeyOf / sessionTouchesDay', () => {
  it('日期键补零', () => {
    expect(dayKeyOf(at(2026, 1, 5, 8, 0))).toBe('2026-01-05')
  })

  it('开始或结束落在当天都算当天（跨零点长会话两端可见）', () => {
    const session = { start: at(2026, 10, 1, 23, 40), end: at(2026, 10, 2, 1, 20) }
    expect(sessionTouchesDay(session, '2026-10-01')).toBe(true)
    expect(sessionTouchesDay(session, '2026-10-02')).toBe(true)
    expect(sessionTouchesDay(session, '2026-10-03')).toBe(false)
  })

  it('没有开始时间不算任何一天', () => {
    expect(sessionTouchesDay({ start: null, end: at(2026, 10, 2, 1, 0) }, '2026-10-02')).toBe(false)
  })
})

describe('日期标签', () => {
  it('今天与昨天带前缀', () => {
    const today = dayKeyOf(Date.now())
    expect(formatDayLabel(today)).toMatch(/^今天 · \d+月\d+日 周[日一二三四五六]$/)
  })

  it('简短标签不带今天/昨天前缀', () => {
    const today = dayKeyOf(Date.now())
    const label = formatDayLabelShort(today)
    expect(label).not.toContain('今天')
    expect(label).toMatch(/^\d+月\d+日 周[日一二三四五六]$/)
  })
})

describe('sessionDurationMinutes', () => {
  it('缺失或倒序时间返回 0', () => {
    expect(sessionDurationMinutes({ start: null, end: null })).toBe(0)
    expect(sessionDurationMinutes({ start: at(2026, 10, 2, 10, 0), end: null })).toBe(0)
    expect(
      sessionDurationMinutes({ start: at(2026, 10, 2, 10, 0), end: at(2026, 10, 2, 9, 0) }),
    ).toBe(0)
  })

  it('按分钟四舍五入', () => {
    expect(
      sessionDurationMinutes({ start: at(2026, 10, 2, 10, 0), end: at(2026, 10, 2, 11, 30) }),
    ).toBe(90)
  })
})

describe('formatDuration', () => {
  it('0 或负数返回空串（调用方用 || 兜底）', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(-5)).toBe('')
  })

  it('一小时以内用分钟', () => {
    expect(formatDuration(45)).toBe('45 分钟')
  })

  it('两小时以内用小时 + 分钟', () => {
    expect(formatDuration(150)).toBe('2 小时 30 分')
    expect(formatDuration(180)).toBe('3 小时')
  })

  it('超过两天改用「天 + 小时」，避免出现上千小时', () => {
    expect(formatDuration(48 * 60)).toBe('2 天')
    expect(formatDuration((2 * 24 + 4) * 60)).toBe('2 天 4 小时')
    expect(formatDuration(7810 * 60)).toBe('325 天 10 小时')
  })
})

describe('formatSessionTime', () => {
  it('缺少开始时间时明确标注未知，而不是 --:--', () => {
    expect(formatSessionTime(null, null)).toEqual({ text: '时间未知', unknown: true })
  })

  it('有时间时返回区间', () => {
    expect(formatSessionTime(at(2026, 10, 2, 9, 0), at(2026, 10, 2, 10, 0))).toEqual({
      text: '09:00 – 10:00',
      unknown: false,
    })
  })
})

describe('shortenPath', () => {
  it('去掉项目根目录前缀得到相对路径', () => {
    expect(shortenPath('C:\\work\\app\\src\\index.ts', 'C:\\work\\app')).toBe('src/index.ts')
    expect(shortenPath('/home/u/app/src/a.ts', '/home/u/app')).toBe('src/a.ts')
  })

  it('大小写与斜杠方向不敏感', () => {
    expect(shortenPath('c:/Work/App/src/a.ts', 'C:\\work\\app')).toBe('src/a.ts')
  })

  it('无根目录时保留末尾两段', () => {
    expect(shortenPath('C:\\a\\b\\c\\d.ts')).toBe('…/c/d.ts')
  })

  it('短路径或没有分隔符时原样返回', () => {
    expect(shortenPath('Hermes 桌面')).toBe('Hermes 桌面')
    expect(shortenPath('a/b')).toBe('a/b')
  })
})
