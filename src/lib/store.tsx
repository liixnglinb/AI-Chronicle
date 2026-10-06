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
import { retryWithBackoff, TimeoutError, withTimeout } from './async'

/** 本机采集耗时随会话文件数量变化：2026-10-06 实测 1160 个文件冷启动 28.1 秒、
 *  命中缓存 1.0 秒。超过 60 秒认定 IPC 挂死，界面必须给出可读原因和重试入口，
 *  否则会永远停在「正在读取本地会话…」。主进程对并发采集做了去重，超时后重试是安全的。 */
const INGEST_TIMEOUT_MS = 60_000

export type AutoRefreshInterval = 60 | 300 | 900 | 0

export interface ChronicleSettings {
  autoRefreshSeconds: AutoRefreshInterval
  /** 界面是否显示工作目录（目录名 / 面包屑 / 完整路径）。默认关闭，只在设置中心手动打开 */
  showProjectPaths: boolean
}

const SETTINGS_KEY = 'ai-chronicle-settings-v1'
const DEFAULT_SETTINGS: ChronicleSettings = { autoRefreshSeconds: 60, showProjectPaths: false }

function loadSettings(): ChronicleSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ChronicleSettings>
    return {
      autoRefreshSeconds: [0, 60, 300, 900].includes(parsed.autoRefreshSeconds ?? 60)
        ? (parsed.autoRefreshSeconds as AutoRefreshInterval)
        : DEFAULT_SETTINGS.autoRefreshSeconds,
      showProjectPaths: parsed.showProjectPaths === true,
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
  /** 当前采集阶段：全量采集要几十秒，需要阶段感知而不是一个孤零零的转圈 */
  progress: IngestProgress | null
  update: UpdateStatusPayload | null
  /**
   * 界面里所有"现在"的统一参照：最近一次采集的时间戳（未采集到时为 0）。
   *
   * 原来各页在 render 里直接调 Date.now()，有两个后果：一是渲染不是纯函数
   * （oxlint react(purity) 告警），二是 `useMemo(..., [])` 把"今日"冻在启动那一刻 ——
   * 应用通宵开着时，"今日工作台"到第二天仍显示昨天的会话。改成跟随采集时间后，
   * 最迟一个刷新周期内自动跨天，且同一屏的"今日"和"近 7 天"用的是同一个现在。
   */
  nowRef: number
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

  const load = useCallback((force = false, allowRetry = false): Promise<boolean> => {
    if (!window.desktopAPI) return Promise.resolve(false)
    if (inFlight.current) return inFlight.current
    setLoading(true)
    setError(null)
    const request = () =>
      withTimeout(window.desktopAPI!.ingest(force), INGEST_TIMEOUT_MS, '本机采集')
    const operation = (async () => {
      // Defer the bridge call until the in-flight promise is assigned, even if it throws synchronously.
      await Promise.resolve()
      try {
        const result = allowRetry
          ? await retryWithBackoff(request, 2, 800, (err) => !(err instanceof TimeoutError))
          : await request()
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

  // 冷启动最容易撞上磁盘未就绪、杀软逐个扫描会话文件这类瞬时拒绝，
  // 退避重试一次；超时不重试（主进程会去重复用同一个挂死任务，重试只是再等 60 秒）。
  useEffect(() => {
    void load(false, true)
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
  // 「关闭定时刷新」只关掉轮询定时器：切回窗口时补一次采集不算定时轮询，
  // 否则关掉后新会话要等到重启软件才看得见。
  useEffect(() => {
    if (!isDesktop) return undefined
    const onFocus = () => {
      if (document.hidden) return
      void load(false)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const interval = settings.autoRefreshSeconds
    const timer = interval
      ? window.setInterval(() => {
          onFocus()
        }, interval * 1000)
      : 0
    return () => {
      if (timer) window.clearInterval(timer)
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

  // 更新状态：主进程事件 → 上下文（常驻更新框 / 设置页共用）。
  // 挂载时先拉一次当前状态：主进程在启动 7 秒就查完并推送过了，渲染进程重载
  // （崩溃后一键重新加载、手动刷新）若只等推送，界面会退回「尚未检查」，
  // 已经下载好的更新包也就看不见了。已经收到过推送时不回卷，避免用旧值盖掉新值。
  useEffect(() => {
    if (!window.desktopAPI) return undefined
    let pushed = false
    const unsubscribe = window.desktopAPI.onUpdateStatus((status) => {
      pushed = true
      setUpdate(status)
    })
    void window.desktopAPI.getUpdateState().then((status) => {
      if (pushed) return
      setUpdate(status)
    })
    return unsubscribe
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
      nowRef: data?.generatedAt ?? 0,
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
