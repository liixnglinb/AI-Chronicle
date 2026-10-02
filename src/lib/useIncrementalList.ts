import { useMemo, useState } from 'react'

interface IncrementalListOptions {
  /** 每页条数，默认 30 */
  pageSize?: number
  /**
   * 重置键：筛选条件或搜索词变化时传入新的值，列表会回到第一页。
   * 通常用 `${range}|${tool}|${sort}|${query}` 这类拼接串。
   */
  resetKey?: string
}

interface IncrementalListResult<T> {
  visibleItems: T[]
  /** 还有未渲染的条目 */
  hasMore: boolean
  /** 未渲染的条目数量 */
  remaining: number
  loadMore: () => void
}

/**
 * 增量渲染长列表：先渲染前 N 条，用户点「显示更多」再追加。
 * 项目集（100+ 卡片）与成果集（100+ 行）这类列表用它把首屏 DOM 控制在可控规模，
 * 避免一次挂载上千个节点拖慢首次交互。
 */
export function useIncrementalList<T>(
  items: T[],
  { pageSize = 30, resetKey = '' }: IncrementalListOptions = {},
): IncrementalListResult<T> {
  const [state, setState] = useState({ resetKey, count: pageSize })

  // 筛选条件变化时回到第一页。在渲染期调整 state 而不是放进 useEffect：
  // React 会立刻重渲染且不提交中间结果，比 effect 少一次渲染，也不会闪一下旧数据。
  if (state.resetKey !== resetKey) {
    setState({ resetKey, count: pageSize })
  }

  const visibleItems = useMemo(() => items.slice(0, state.count), [items, state.count])

  return {
    visibleItems,
    hasMore: items.length > state.count,
    remaining: Math.max(0, items.length - state.count),
    loadMore: () => setState((current) => ({ ...current, count: current.count + pageSize })),
  }
}
