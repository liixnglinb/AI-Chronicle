export {}

declare global {
  interface DesktopRuntimeInfo {
    version: string
    platform: string
    arch: string
    dataPath: string
    packaged: boolean
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
