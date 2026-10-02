// 运行环境与发布通道。
// 通过 Vite 的 mode 与 VITE_* 变量分层，避免把环境判断散落在业务代码里。
export type AppChannel = 'stable' | 'beta' | 'dev'

function readChannel(): AppChannel {
  const raw = import.meta.env.VITE_APP_CHANNEL
  if (raw === 'beta' || raw === 'dev' || raw === 'stable') return raw
  return import.meta.env.DEV ? 'dev' : 'stable'
}

export const APP_ENV = {
  /** Vite 运行模式：development / production / test */
  mode: import.meta.env.MODE as string,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  /** 发布通道，用于界面标注与诊断信息 */
  channel: readChannel(),
} as const

export const CHANNEL_LABEL: Record<AppChannel, string> = {
  stable: '正式通道',
  beta: '测试通道',
  dev: '开发模式',
}
