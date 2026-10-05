export {}

declare global {
  /** 主进程 → 渲染进程的更新状态载荷（推送与拉取共用同一份形状） */
  interface UpdateStatusPayload {
    state: string
    version?: string
    percent?: number
    message?: string
    notes?: string
    source?: string
    skippedVersion?: string
    autoDownload?: boolean
    probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
  }

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

  /** 数据源探测路径：spec 为声明值（~ / %APPDATA% 形态），resolved 为本机绝对路径 */
  interface SourcePathInfo {
    spec: string
    resolved: string
    exists: boolean
  }

  /** 采集协议：jsonl 逐行 / sqlite 只读数据库 / zstd 压缩 / none 仅探测 */
  type SourceProtocol = 'jsonl' | 'sqlite' | 'zstd' | 'none'

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
    /** 协议特征：接入中心据此说明「怎么读到的」 */
    protocol?: SourceProtocol
    /** 访问方式：本应用一律只读 */
    access?: 'read-only' | 'none'
    /** 接入指导：期望的目录结构 */
    hint?: string
    /** 真实探测路径与存在性 */
    paths?: SourcePathInfo[]
  }

  /** 采集阶段：枚举 → 解析 → 挂载成果 → 完成 */
  type IngestPhase = 'enumerate' | 'parse' | 'artifacts' | 'done'

  interface IngestProgress {
    phase: IngestPhase
    detail: string
    index: number
    total: number
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
      /** 拉取主进程当前的更新状态（推送只在状态变化时发一次） */
      getUpdateState: () => Promise<UpdateStatusPayload>
      downloadUpdate: () => Promise<{ ok: boolean; version?: string; message?: string }>
      setUpdateAutoDownload: (enabled: boolean) => Promise<{ ok: boolean; autoDownload: boolean }>
      installUpdate: () => Promise<{ ok: boolean; canceled?: boolean; message?: string }>
      setSkippedUpdate: (version: string | null) => Promise<{ ok: boolean; skippedVersion: string }>
      openUpdatePage: () => Promise<{ ok: boolean }>
      onUpdateStatus: (callback: (status: UpdateStatusPayload) => void) => () => void
      onIngestProgress: (callback: (progress: IngestProgress) => void) => () => void
    }
  }
}
