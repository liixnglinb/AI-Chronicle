// 全局错误收集：把渲染进程的未捕获错误与未处理 Promise 拒绝
// 转发到主进程日志文件，避免只在控制台里一闪而过。
export interface RendererErrorPayload {
  scope: 'error' | 'unhandledrejection' | 'render'
  message: string
  stack?: string
  source?: string
}

function toPayload(scope: RendererErrorPayload['scope'], error: unknown): RendererErrorPayload {
  if (error instanceof Error) {
    return { scope, message: error.message || String(error), stack: error.stack }
  }
  return { scope, message: typeof error === 'string' ? error : JSON.stringify(error) }
}

export function reportError(payload: RendererErrorPayload) {
  try {
    void window.desktopAPI?.reportError?.(payload)
  } catch {
    // 上报本身失败时不再抛出，避免形成错误循环
  }
}

/** 安装全局兜底。返回卸载函数，便于在严格模式下重复挂载时清理。 */
export function installGlobalErrorHandlers(): () => void {
  function onError(event: ErrorEvent) {
    reportError({
      scope: 'error',
      message: event.message || '未知脚本错误',
      stack: event.error instanceof Error ? event.error.stack : undefined,
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    })
  }

  function onUnhandledRejection(event: PromiseRejectionEvent) {
    reportError(toPayload('unhandledrejection', event.reason))
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
