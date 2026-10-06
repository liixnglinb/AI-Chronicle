/**
 * 异步工具的纯函数集合（可单测，不依赖 React / DOM）。
 */

export class TimeoutError extends Error {
  constructor(ms: number, label: string) {
    super(`${label}超过 ${Math.round(ms / 1000)} 秒未返回`)
    this.name = 'TimeoutError'
  }
}

/**
 * 给 promise 加一个上限：超时后 reject，让界面能给出可读原因 + 重试入口，
 * 而不是永远停在「正在加载」。注意：超时只是不再等待，被包裹的任务本身仍在跑
 * （调用方若需取消，要另外传 AbortController —— 本机 IPC 不支持中途取消）。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!(ms > 0)) return promise
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * 有限次重试 + 指数退避。attempts 是总尝试次数（含第一次）。
 * 只用于「重试是安全的」幂等操作；有副作用的操作不要用它。
 * retryWhen 返回 false 时立刻把错误抛给调用方（例如超时——重试只会排在同一个挂死的任务后面）。
 */
export async function retryWithBackoff<T>(
  task: (attempt: number) => Promise<T>,
  attempts = 3,
  baseDelayMs = 400,
  retryWhen: (error: unknown) => boolean = () => true,
): Promise<T> {
  let lastError: unknown = null
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await task(i)
    } catch (error) {
      lastError = error
      if (!retryWhen(error) || i >= attempts) throw asError(error)
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (i - 1)))
    }
  }
  throw asError(lastError)
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('重试全部失败')
}
