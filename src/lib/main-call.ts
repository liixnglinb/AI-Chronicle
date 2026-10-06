import type { ToastMessage } from '../types'
import { withTimeout } from './async'

export type ToastPusher = (toast: Omit<ToastMessage, 'id'>) => void

/**
 * 主进程调用的统一收口：超时、异常都要变成一条看得见的提示。
 *
 * 返回 null 表示失败已经提示过了，调用方直接结束 —— 不要再拿结果去读字段。
 * 之前各处只有 try/finally（负责收尾不负责报错），IPC 一旦拒绝，
 * 界面上的表现就是「按钮点下去转一下就停住，什么都没发生」。
 */
export async function callDesktop<T>(
  onToast: ToastPusher | undefined,
  label: string,
  task: () => Promise<T>,
  timeoutMs?: number,
): Promise<T | null> {
  try {
    const request = task()
    return await (timeoutMs ? withTimeout(request, timeoutMs, label) : request)
  } catch (err) {
    onToast?.({
      tone: 'danger',
      title: `${label}失败`,
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
