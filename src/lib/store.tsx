import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  refresh: (force?: boolean) => Promise<boolean>
  /** 当前采集阶段：全量采集 3~15 秒，需要阶段感知而不是一个孤零零的转圈 */
  progress: IngestProgress | null
  update: {
    state: string
    version?: string
    percent?: number
    notes?: string
    message?: string
    source?: string
    skippedVersion?: string
    probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
  } | null
}

const ChronicleContext = createContext<ChronicleContextValue | null>(null)

export function ChronicleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ChronicleData | null>(null)
  const [loading, setLoading] = useState(() => !!window.desktopAPI)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<IngestProgress | null>(null)
  const [update, setUpdate] = useState<ChronicleContextValue['update']>(null)
  const [settings, setSettings] = useState<ChronicleSettings>(loadSettings)
  const isDesktop = !!window.desktopAPI
  const inFlight = useRef<Promise<boolean> | null>(null)

  const load = useCallback((force = false): Promise<boolean> => {
    if (!window.desktopAPI) return Promise.resolve(false)
    if (inFlight.current) return inFlight.current
    setLoading(true)
    setError(null)
    const operation = (async () => {
      // Defer the bridge call until the in-flight promise is assigned, even if it throws synchronously.
      await Promise.resolve()
      try {
        const result = await window.desktopAPI!.ingest(force)
        setData(result)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return false
      } finally {
        setLoading(false)
        inFlight.current = null
      }
    })()
    inFlight.current = operation
    return operation
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
      if (document.hidden) return
      void load(false)
    }
    const interval = settings.autoRefreshSeconds
    if (!interval) return undefined

    const timer = window.setInterval(() => {
      onFocus()
    }, interval * 1000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [isDesktop, load, settings.autoRefreshSeconds])

  // 采集阶段：主进程逐源推送，用于渲染阶段感知与单源故障定位
  useEffect(() => {
    if (!window.desktopAPI?.onIngestProgress) return undefined
    return window.desktopAPI.onIngestProgress((next) => {
      setProgress(next)
    })
  }, [])

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
        skippedVersion: status.skippedVersion,
        probes: status.probes,
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
      progress,
      update,
    }),
    [data, loading, error, isDesktop, settings, updateSettings, load, progress, update],
  )

  return <ChronicleContext.Provider value={value}>{children}</ChronicleContext.Provider>
}

export function useChronicle(): ChronicleContextValue {
  const value = useContext(ChronicleContext)
  if (!value) throw new Error('useChronicle 必须在 ChronicleProvider 内使用')
  return value
}
