import { useEffect, useState } from 'react'

/** Persist only UI preferences for this app session, never records or credentials. */
export function useViewState<T>(key: string, fallback: T, valid: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem('voyra-view-' + key) || 'null')
      return valid(stored) ? stored : fallback
    } catch {
      return fallback
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem('voyra-view-' + key, JSON.stringify(value))
    } catch {
      /* session storage can be unavailable */
    }
  }, [key, value])
  return [value, setValue] as const
}

export const isFilter = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 256
export const isOpenGroup = (value: unknown): value is string | null =>
  value === null || isFilter(value)
