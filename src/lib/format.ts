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

/** 简短日期标签（M月D日 周X），用于指标卡等空间受限的位置 */
export function formatDayLabelShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
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
  // 累计时长可能达到数百小时，超过两天时改用「天 + 小时」表达更直观
  if (h >= 48) {
    const days = Math.floor(h / 24)
    const restHours = h % 24
    return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`
  }
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

/**
 * 会话时间文本。部分数据源没有可解析的开始时间，
 * 此时明确标注「时间未知」，而不是显示无意义的「--:--」。
 */
export function formatSessionTime(
  start: number | null,
  end: number | null,
): { text: string; unknown: boolean } {
  if (!start) return { text: '时间未知', unknown: true }
  return { text: formatTimeRange(start, end), unknown: false }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * 路径缩写：优先去掉项目根目录前缀，得到相对路径；
 * 无法匹配根目录时保留末尾两段，避免列表里出现冗长的绝对路径。
 */
export function shortenPath(fullPath: string, root?: string): string {
  const target = normalizePath(fullPath)
  const base = root ? normalizePath(root) : ''
  if (base && target.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    return target.slice(base.length + 1)
  }
  const parts = target.split('/').filter(Boolean)
  if (parts.length <= 3) return target
  return `…/${parts.slice(-2).join('/')}`
}
