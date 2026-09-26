export {}

declare global {
  interface DesktopRuntimeInfo {
    version: string
    platform: string
    arch: string
    dataPath: string
    packaged: boolean
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
      checkForUpdates: () => Promise<{
        ok: boolean
        state: string
        version?: string
        message?: string
      }>
      installUpdate: () => Promise<{ ok: boolean; message?: string }>
      onUpdateStatus: (
        callback: (status: {
          state: string
          version?: string
          percent?: number
          message?: string
        }) => void,
      ) => () => void
    }
  }
}
