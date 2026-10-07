import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'ai-chronicle-view-v1'

type Bag = Record<string, unknown>

function readBag(): Bag {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Bag) : {}
  } catch {
    return {}
  }
}

/**
 * 与 useViewState 同签名，但落 localStorage：
 * 日历的页签 / 年月 / 选中日期要跨重启保留，sessionStorage 一关窗口就没了。
 * 只存界面偏好，会话内容一律不进这里。
 */
export function usePersistedViewState<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    const stored: unknown = readBag()[key]
    return valid(stored) ? stored : fallback
  })

  useEffect(() => {
    if (!valid(value)) return
    try {
      // 写入前重新读一次：多个键各自持有自己的 hook，避免后写的把先写的覆盖掉
      const bag = readBag()
      bag[key] = value
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bag))
    } catch {
      /* 配额异常或被策略禁用：静默降级为不持久 */
    }
  }, [key, value, valid])

  const reset = useCallback(() => {
    setValue(fallback)
    try {
      const bag = readBag()
      delete bag[key]
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bag))
    } catch {
      /* 同上 */
    }
  }, [fallback, key])

  return [value, setValue, reset] as const
}

export const isTab = (value: unknown): value is 'list' | 'calendar' =>
  value === 'list' || value === 'calendar'
export const isDayKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
export const isDayKeyOrNull = (value: unknown): value is string | null =>
  value === null || isDayKey(value)
export const isMonth = (value: unknown): value is { year: number; month: number } => {
  if (!value || typeof value !== 'object') return false
  const v = value as { year?: unknown; month?: unknown }
  return (
    typeof v.year === 'number' &&
    Number.isInteger(v.year) &&
    v.year >= 2000 &&
    v.year <= 2999 &&
    typeof v.month === 'number' &&
    v.month >= 1 &&
    v.month <= 12
  )
}
/** null = 还没选过月，界面按"今天所在月"呈现 */
export const isMonthOrNull = (value: unknown): value is { year: number; month: number } | null =>
  value === null || isMonth(value)
