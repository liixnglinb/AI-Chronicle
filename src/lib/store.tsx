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
}

const ChronicleContext = createContext<ChronicleContextValue | null>(null)

export function ChronicleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ChronicleData | null>(null)
  const [loading, setLoading] = useState(() => !!window.desktopAPI)
  const [error, setError] = useState<string | null>(null)
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

  const value = useMemo<ChronicleContextValue>(
    () => ({ data, loading, error, isDesktop, refresh: load }),
    [data, loading, error, isDesktop, load],
  )

  return <ChronicleContext.Provider value={value}>{children}</ChronicleContext.Provider>
}

export function useChronicle(): ChronicleContextValue {
  const value = useContext(ChronicleContext)
  if (!value) throw new Error('useChronicle 必须在 ChronicleProvider 内使用')
  return value
}
