// 展示格式化工具（工作日志视角：时间 / 轮次 / 文件，不含 token 计价）

export function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDayClock(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${formatClock(ms)}`
}

export function formatTimeRange(start: number | null, end: number | null): string {
  if (!start) return '--:--'
  if (!end || end === start) return formatClock(start)
  // 跨零点的会话带上日期，避免「05:01 – 01:42」这类歧义
  if (dayKeyOf(start) !== dayKeyOf(end)) {
    return `${formatDayClock(start)} → ${formatDayClock(end)}`
  }
  return `${formatClock(start)} – ${formatClock(end)}`
}

export function dayKeyOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

// 会话归属某天：开始或结束落在该天都算（跨零点的长会话两端都能看到）
export function sessionTouchesDay(
  s: { start: number | null; end: number | null },
  key: string,
): boolean {
  if (!s.start) return false
  if (dayKeyOf(s.start) === key) return true
  return !!s.end && dayKeyOf(s.end) === key
}

export function formatDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const today = dayKeyOf(Date.now())
  const yesterday = dayKeyOf(Date.now() - 86_400_000)
  if (key === today) return `今天 · ${m}月${d}日 ${weekdays[date.getDay()]}`
  if (key === yesterday) return `昨天 · ${m}月${d}日 ${weekdays[date.getDay()]}`
  return `${m}月${d}日 ${weekdays[date.getDay()]}`
}

export function sessionDurationMinutes(s: { start: number | null; end: number | null }): number {
  if (!s.start || !s.end || s.end <= s.start) return 0
  return Math.round((s.end - s.start) / 60_000)
}

export function formatDuration(mins: number): string {
  if (mins <= 0) return ''
  if (mins < 60) return `${mins} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}
