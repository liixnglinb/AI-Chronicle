import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { activityLevel, buildMonthMatrix, monthLabel, shiftMonth } from '../lib/calendar'
import type { DayCell } from '../lib/calendar'
import { dayKeyOf, formatDayLabel, formatDuration } from '../lib/format'
import { classNames } from '../lib/utils'
import { SessionRow } from './SessionRow'
import type { ToastPusher } from '../lib/main-call'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { SessionRecord } from '../types'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

interface HistoryCalendarProps {
  /** 已按搜索词/数据源过滤后的会话：格子与当天面板都只反映这份数据 */
  sessions: SessionRecord[]
  cells: Map<string, DayCell>
  allProjectPaths: string[]
  showPaths: boolean
  onToast: ToastPusher
  month: { year: number; month: number }
  onMonthChange: (month: { year: number; month: number }) => void
  selectedDay: string | null
  onSelectDay: (dayKey: string | null) => void
  todayKey: string
  /** 有记录的月份边界；null 表示当前筛选下一条记录都没有 */
  range: {
    min: { year: number; month: number }
    max: { year: number; month: number }
  } | null
  renderDayExtra?: (dayKey: string) => ReactNode
}

function addDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return dayKeyOf(new Date(y, m - 1, d + delta).getTime())
}

function monthIndex(m: { year: number; month: number }) {
  return m.year * 12 + (m.month - 1)
}

/**
 * 会话档案的日历视图：格子按当天记录数分强度，点一天看当天做了什么。
 * 键盘可完整操作（方向键走格、PgUp/PgDn 切月、Enter 选中、Esc 取消），
 * 焦点不逃出当月，避免出现"按着按着找不到焦点"。
 */
export function HistoryCalendar({
  sessions,
  cells,
  allProjectPaths,
  showPaths,
  onToast,
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
  todayKey,
  range,
  renderDayExtra,
}: HistoryCalendarProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [focusRaw, setFocusRaw] = useState<string>(selectedDay ?? todayKey)

  const matrix = useMemo(() => buildMonthMatrix(month.year, month.month), [month])
  const days = useMemo(() => matrix.map((c) => c.dayKey).filter(Boolean) as string[], [matrix])

  // 焦点格直接推导，不用 setState 去"修正"：切月后旧焦点日不在当月时，
  // 落到当月第一个有记录的日子（没有记录就落第一天）。
  const focusDay = days.includes(focusRaw)
    ? focusRaw
    : (days.find((d) => (cells.get(d)?.count ?? 0) > 0) ?? days[0] ?? todayKey)

  useEffect(() => {
    if (!gridRef.current?.contains(document.activeElement)) return
    cellRefs.current[focusDay]?.focus()
  }, [focusDay, month])

  const moveFocus = useCallback(
    (next: string) => {
      if (days.includes(next)) setFocusRaw(next)
    },
    [days],
  )

  function onKeyDown(event: ReactKeyboardEvent) {
    const base = days.includes(focusDay) ? focusDay : days[0]
    if (!base) return
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        moveFocus(addDays(base, -1))
        break
      case 'ArrowRight':
        event.preventDefault()
        moveFocus(addDays(base, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(addDays(base, -7))
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(addDays(base, 7))
        break
      case 'Home':
        event.preventDefault()
        moveFocus(days[0])
        break
      case 'End':
        event.preventDefault()
        moveFocus(days[days.length - 1])
        break
      case 'PageUp':
        event.preventDefault()
        onMonthChange(shiftMonth(month.year, month.month, -1))
        break
      case 'PageDown':
        event.preventDefault()
        onMonthChange(shiftMonth(month.year, month.month, 1))
        break
      case 'Escape':
        if (selectedDay) {
          event.preventDefault()
          onSelectDay(null)
        }
        break
      case 'Enter':
      case ' ':
        if (days.includes(base)) {
          event.preventDefault()
          onSelectDay(selectedDay === base ? null : base)
        }
        break
    }
  }

  const cur = monthIndex(month)
  const canPrev = !range || cur > monthIndex(range.min)
  const canNext = !range || cur < monthIndex(range.max)
  const activeCount = days.filter((d) => (cells.get(d)?.count ?? 0) > 0).length
  const selected = selectedDay ? cells.get(selectedDay) : undefined
  const todayMonthKey = todayKey.slice(0, 7)
  const shownMonthKey = `${month.year}-${String(month.month).padStart(2, '0')}`

  const selectedSessions = useMemo(
    () =>
      selectedDay
        ? sessions
            .filter((s) => s.start && dayKeyOf(s.start) === selectedDay)
            .sort((a, b) => (b.start || 0) - (a.start || 0))
        : [],
    [selectedDay, sessions],
  )

  function jumpToLatest() {
    if (!range) return
    onMonthChange(range.max)
    const prefix = `${range.max.year}-${String(range.max.month).padStart(2, '0')}`
    const last = [...cells.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .pop()
    if (last) onSelectDay(last)
  }

  return (
    <div className="desk-calendar">
      <div className="desk-cal-head">
        <div className="desk-cal-nav">
          <button
            className="desk-cal-arrow"
            onClick={() => onMonthChange(shiftMonth(month.year, month.month, -1))}
            disabled={!canPrev}
            aria-label="上一月"
            title={canPrev ? '上一月（PgUp）' : '更早没有记录了'}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="desk-cal-month">{monthLabel(month.year, month.month)}</span>
          <button
            className="desk-cal-arrow"
            onClick={() => onMonthChange(shiftMonth(month.year, month.month, 1))}
            disabled={!canNext}
            aria-label="下一月"
            title={canNext ? '下一月（PgDn）' : '更晚还没有记录'}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="desk-cal-head-right">
          <span className="desk-cal-summary">
            {activeCount > 0 ? `${activeCount} 天有记录` : '本月没有会话记录'}
          </span>
          {todayMonthKey !== shownMonthKey && (
            <button
              className="desk-cal-jump"
              onClick={() => {
                const [y, m] = todayKey.split('-').map(Number)
                onMonthChange({ year: y, month: m })
                onSelectDay(todayKey)
              }}
            >
              回到今天
            </button>
          )}
          {activeCount === 0 && range && (
            <button className="desk-cal-jump" onClick={jumpToLatest}>
              跳到最近有记录的月份
            </button>
          )}
        </div>
      </div>

      <div
        className="desk-cal-grid"
        ref={gridRef}
        role="grid"
        onKeyDown={onKeyDown}
        aria-label="会话日历"
      >
        <div className="desk-cal-row desk-cal-weekrow" role="row">
          {WEEKDAYS.map((w) => (
            <span key={w} className="desk-cal-week" role="columnheader">
              {w}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, weekIdx) => (
          <div className="desk-cal-row" key={weekIdx} role="row">
            {matrix.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell, colIdx) => {
              if (!cell.dayKey) {
                return (
                  <span
                    className="desk-cal-cell is-blank"
                    key={`blank-${colIdx}`}
                    role="gridcell"
                    aria-hidden="true"
                  />
                )
              }
              const dayKey = cell.dayKey
              const data = cells.get(dayKey)
              const count = data?.count ?? 0
              const level = activityLevel(count)
              const isSelected = selectedDay === dayKey
              return (
                <button
                  key={dayKey}
                  ref={(el) => {
                    cellRefs.current[dayKey] = el
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={focusDay === dayKey ? 0 : -1}
                  className={classNames(
                    'desk-cal-cell',
                    level > 0 && `is-level-${level}`,
                    dayKey === todayKey && 'is-today',
                    isSelected && 'is-selected',
                  )}
                  aria-selected={isSelected}
                  aria-label={`${dayKey}，${count > 0 ? `${count} 场会话` : '无记录'}`}
                  onClick={() => {
                    setFocusRaw(dayKey)
                    onSelectDay(isSelected ? null : dayKey)
                  }}
                  onFocus={() => setFocusRaw(dayKey)}
                >
                  <span className="desk-cal-daynum">{Number(dayKey.slice(8))}</span>
                  {count > 0 && (
                    <>
                      <span className="desk-cal-count">{count}</span>
                      <span className="desk-cal-dots">
                        {(data?.toolColors ?? []).slice(0, 4).map((color, i) => (
                          <span
                            key={i}
                            className="desk-cal-dot"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {selectedDay && (
        <section className="desk-panel desk-cal-daypanel desk-enter" aria-label="当天记录">
          <header className="desk-cal-panel-head">
            <CalendarDays size={14} />
            <strong>{formatDayLabel(selectedDay)}</strong>
            {selected && (
              <span className="desk-cal-panel-stats">
                <span className="desk-day-stat-pill">{selected.count} 会话</span>
                <span className="desk-day-stat-pill">{selected.turns} 轮</span>
                {selected.minutes > 0 && (
                  <span className="desk-day-stat-pill">{formatDuration(selected.minutes)}</span>
                )}
              </span>
            )}
            <button
              className="desk-cal-close"
              onClick={() => onSelectDay(null)}
              aria-label="收起当天面板"
            >
              收起
            </button>
          </header>

          {selectedSessions.length > 0 ? (
            <div className="desk-session-rows">
              {selectedSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  showPaths={showPaths}
                  allProjectPaths={allProjectPaths}
                  onToast={onToast}
                />
              ))}
            </div>
          ) : (
            <p className="desk-cal-empty-day">
              这天原本有记录，但在当前筛选（搜索词 / 数据源）下没有匹配项。撤掉筛选即可看到。
            </p>
          )}

          {renderDayExtra?.(selectedDay)}
        </section>
      )}
    </div>
  )
}
