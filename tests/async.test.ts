import { describe, expect, it, vi } from 'vitest'
import { retryWithBackoff, TimeoutError, withTimeout } from '../src/lib/async'

describe('withTimeout', () => {
  it('任务在期限内完成时原样返回结果，并且不留定时器', async () => {
    vi.useFakeTimers()
    try {
      const value = await withTimeout(Promise.resolve('会话数据'), 60_000, '本机采集')
      expect(value).toBe('会话数据')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('任务挂死时抛出可读的超时原因，界面才有东西可显示', async () => {
    vi.useFakeTimers()
    try {
      const settled = withTimeout(new Promise<string>(() => {}), 5_000, '本机采集').catch(
        (error: unknown) => error,
      )
      await vi.advanceTimersByTimeAsync(5_000)
      const error = await settled
      expect(error).toBeInstanceOf(TimeoutError)
      expect((error as Error).message).toBe('本机采集超过 5 秒未返回')
    } finally {
      vi.useRealTimers()
    }
  })

  it('任务失败时超时器不会把原始错误替换掉', async () => {
    vi.useFakeTimers()
    try {
      const settled = withTimeout(
        Promise.reject(new Error('磁盘不可读')),
        60_000,
        '本机采集',
      ).catch((error: unknown) => error)
      const error = await settled
      expect((error as Error).message).toBe('磁盘不可读')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ms<=0 表示不设上限（保留"手动触发不要误报超时"的口子）', async () => {
    const pending = Promise.resolve('ok')
    expect(withTimeout(pending, 0, '本机采集')).toBe(pending)
  })
})

describe('retryWithBackoff', () => {
  it('瞬时失败按指数退避重试，成功时返回第一次没有的结果', async () => {
    vi.useFakeTimers()
    try {
      const stamps: number[] = []
      const settled = retryWithBackoff(
        async () => {
          stamps.push(Date.now())
          if (stamps.length < 3) throw new Error('瞬时拒绝')
          return 'done'
        },
        3,
        400,
      ).then(
        (value) => value,
        (error: unknown) => error,
      )
      await vi.advanceTimersByTimeAsync(400 + 800)
      expect(await settled).toBe('done')
      expect(stamps).toHaveLength(3)
      // 退避必须是 400 → 800，而不是固定间隔猛撞
      expect(stamps[1] - stamps[0]).toBe(400)
      expect(stamps[2] - stamps[1]).toBe(800)
    } finally {
      vi.useRealTimers()
    }
  })

  it('重试耗尽后抛出最后一次的原始错误，不编造成功', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const settled = retryWithBackoff(
        async () => {
          calls += 1
          throw new Error(`第 ${calls} 次仍然失败`)
        },
        2,
        100,
      ).catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(100)
      expect(((await settled) as Error).message).toBe('第 2 次仍然失败')
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retryWhen 判定不可重试时立刻停手（超时重试只会再等一个超时）', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const settled = retryWithBackoff(
        async () => {
          calls += 1
          throw new TimeoutError(60_000, '本机采集')
        },
        3,
        100,
        (error) => !(error instanceof TimeoutError),
      ).catch((error: unknown) => error)
      const error = await settled
      expect(calls).toBe(1)
      expect(error).toBeInstanceOf(TimeoutError)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('attempts=1 等于不重试，且不会留下等待中的定时器', async () => {
    vi.useFakeTimers()
    try {
      const settled = retryWithBackoff(
        async () => {
          throw new Error('一次就失败')
        },
        1,
        400,
      ).catch((error: unknown) => error)
      expect(((await settled) as Error).message).toBe('一次就失败')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
