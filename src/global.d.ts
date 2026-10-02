export {}

declare global {
  interface DesktopRuntimeInfo {
    version: string
    platform: string
    arch: string
    dataPath: string
    logPath: string
    zoom: number
    packaged: boolean
  }

  interface DesktopErrorReport {
    scope: 'error' | 'unhandledrejection' | 'render'
    message: string
    stack?: string
    source?: string
  }

  interface DesktopPrefs {
    /** 关闭窗口时最小化到托盘而不是退出 */
    minimizeToTray: boolean
    /** 开机自动启动（仅安装版生效） */
    autoStart: boolean
    /** 采集完成后发送系统通知 */
    notifyOnIngest: boolean
  }

  interface SessionArtifact {
    name: string
    path: string
    size: number
    mtime: number
  }

  interface IngestSession {
    id: string
    tool: string
    toolName: string
    toolColor: string
    title: string
    project: string
    projectPath: string
    start: number | null
    end: number | null
    turns: number
    tokensIn: number
    tokensOut: number
    tokensCached: number
    model: string
    hasTokens: boolean
    artifacts: SessionArtifact[]
  }

  interface IngestSource {
    id: string
    name: string
    kind: 'connected' | 'observing'
    status: 'connected' | 'observing' | 'absent' | 'error'
    sessionCount: number
    lastActivity: number | null
    detail: string
    note: string
  }

  interface IngestData {
    generatedAt: number
    sessions: IngestSession[]
    sources: IngestSource[]
    cacheStats: { hit: number; miss: number }
  }

  interface Window {
    desktopAPI?: {
      openPath: (path: string) => Promise<{ ok: boolean; message?: string }>
      saveTextFile: (
        filename: string,
        content: string,
      ) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; message?: string }>
      scanSources: () => Promise<{
        ok: boolean
        scannedAt: string
        sources: Array<{
          id: string
          exists: boolean
          filesToday: number
          lastModified?: string
        }>
      }>
      ingest: (force?: boolean) => Promise<IngestData>
      getRuntimeInfo: () => Promise<DesktopRuntimeInfo>
      setWindowTheme: (theme: 'light' | 'dark') => Promise<{ ok: boolean }>
      reportError: (payload: DesktopErrorReport) => Promise<{ ok: boolean }>
      setZoom: (level: number) => Promise<{ ok: boolean; zoom: number }>
      getDesktopPrefs: () => Promise<DesktopPrefs>
      setDesktopPrefs: (
        patch: Partial<DesktopPrefs>,
      ) => Promise<{ ok: boolean; prefs: DesktopPrefs }>
      exportEncryptedBackup: (payload: {
        content: string
        password: string
        defaultName?: string
      }) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; message?: string }>
      openEncryptedBackup: (password: string) => Promise<{
        ok: boolean
        content?: string
        filePath?: string
        canceled?: boolean
        message?: string
      }>
      checkForUpdates: () => Promise<{
        ok: boolean
        state: string
        version?: string
        message?: string
        source?: string
        notes?: string
        skipped?: boolean
        probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
      }>
      installUpdate: () => Promise<{ ok: boolean; canceled?: boolean; message?: string }>
      setSkippedUpdate: (version: string | null) => Promise<{ ok: boolean; skippedVersion: string }>
      openUpdatePage: () => Promise<{ ok: boolean }>
      onUpdateStatus: (
        callback: (status: {
          state: string
          version?: string
          percent?: number
          message?: string
          notes?: string
          source?: string
          skippedVersion?: string
          probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
        }) => void,
      ) => () => void
    }
  }
}
