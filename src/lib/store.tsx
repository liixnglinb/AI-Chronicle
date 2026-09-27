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

interface ChronicleContextValue {
  data: ChronicleData | null
  loading: boolean
  error: string | null
  isDesktop: boolean
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

  // 数据保活：窗口聚焦 / 每 60 秒静默刷新一次。
  // 采集层有文件级缓存，未变化的文件直接复用，代价很小。
  useEffect(() => {
    if (!isDesktop) return undefined
    const onFocus = () => {
      void load(false)
    }
    const timer = window.setInterval(() => {
      void load(false)
    }, 60_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [isDesktop, load])

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
    () => ({ data, loading, error, isDesktop, refresh: load, update }),
    [data, loading, error, isDesktop, load, update],
  )

  return <ChronicleContext.Provider value={value}>{children}</ChronicleContext.Provider>
}

export function useChronicle(): ChronicleContextValue {
  const value = useContext(ChronicleContext)
  if (!value) throw new Error('useChronicle 必须在 ChronicleProvider 内使用')
  return value
}
