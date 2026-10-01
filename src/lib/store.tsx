import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ChronicleData } from '../types'

export type AutoRefreshInterval = 60 | 300 | 900 | 0

export interface ChronicleSettings {
  autoRefreshSeconds: AutoRefreshInterval
}

const SETTINGS_KEY = 'ai-chronicle-settings-v1'
const DEFAULT_SETTINGS: ChronicleSettings = { autoRefreshSeconds: 60 }

function loadSettings(): ChronicleSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ChronicleSettings>
    return {
      autoRefreshSeconds: [0, 60, 300, 900].includes(parsed.autoRefreshSeconds ?? 60)
        ? (parsed.autoRefreshSeconds as AutoRefreshInterval)
        : DEFAULT_SETTINGS.autoRefreshSeconds,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface ChronicleContextValue {
  data: ChronicleData | null
  loading: boolean
  error: string | null
  isDesktop: boolean
  settings: ChronicleSettings
  updateSettings: (settings: Partial<ChronicleSettings>) => void
  refresh: (force?: boolean) => Promise<void>
  update: {
    state: string
    version?: string
    percent?: number
    notes?: string
    message?: string
    source?: string
  } | null
}

const ChronicleContext = createContext<ChronicleContextValue | null>(null)

export function ChronicleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ChronicleData | null>(null)
  const [loading, setLoading] = useState(() => !!window.desktopAPI)
  const [error, setError] = useState<string | null>(null)
  const [update, setUpdate] = useState<ChronicleContextValue['update']>(null)
  const [settings, setSettings] = useState<ChronicleSettings>(loadSettings)
  const isDesktop = !!window.desktopAPI

  const load = useCallback(async (force = false) => {
    if (!window.desktopAPI) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.desktopAPI.ingest(force)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const updateSettings = useCallback((next: Partial<ChronicleSettings>) => {
    setSettings((current) => {
      const merged = { ...current, ...next }
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
      return merged
    })
  }, [])

  // 数据保活：窗口聚焦 / 按用户偏好静默刷新。
  // 采集层有文件级缓存，未变化的文件直接复用，代价很小。
  useEffect(() => {
    if (!isDesktop) return undefined
    const onFocus = () => {
      void load(false)
    }
    const interval = settings.autoRefreshSeconds
    if (!interval) return undefined

    const timer = window.setInterval(() => {
      void load(false)
    }, interval * 1000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [isDesktop, load, settings.autoRefreshSeconds])

  // 更新状态：主进程事件 → 上下文（常驻更新框 / 设置页共用）
  useEffect(() => {
    if (!window.desktopAPI) return undefined
    return window.desktopAPI.onUpdateStatus((status) => {
      setUpdate({
        state: status.state,
        version: status.version,
        percent: status.percent,
        notes: status.notes,
        message: status.message,
        source: status.source,
      })
    })
  }, [])

  const value = useMemo<ChronicleContextValue>(
    () => ({
      data,
      loading,
      error,
      isDesktop,
      settings,
      updateSettings,
      refresh: load,
      update,
    }),
    [data, loading, error, isDesktop, settings, updateSettings, load, update],
  )

  return <ChronicleContext.Provider value={value}>{children}</ChronicleContext.Provider>
}

export function useChronicle(): ChronicleContextValue {
  const value = useContext(ChronicleContext)
  if (!value) throw new Error('useChronicle 必须在 ChronicleProvider 内使用')
  return value
}
