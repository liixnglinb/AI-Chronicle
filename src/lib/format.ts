// 展示格式化工具

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e8) {
    const v = n / 1e8
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} 亿`
  }
  if (n >= 1e4) {
    return `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)} 万`
  }
  return String(Math.round(n))
}

export function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatTimeRange(start: number | null, end: number | null): string {
  if (!start) return '--:--'
  if (!end || end === start) return formatClock(start)
  return `${formatClock(start)} – ${formatClock(end)}`
}

export function dayKeyOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
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

export function totalTokens(s: {
  tokensIn: number
  tokensOut: number
  tokensCached: number
}): number {
  return (s.tokensIn || 0) + (s.tokensOut || 0) + (s.tokensCached || 0)
}
