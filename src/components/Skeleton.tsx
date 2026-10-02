import { classNames } from '../lib/utils'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
}

/** 骨架块：任意尺寸的占位 */
export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <span className={classNames('skeleton', className)} style={{ width, height }} aria-hidden />
  )
}

/** 汇总条骨架：与 SummaryStrip 的栅格一致，加载时不跳版 */
export function SkeletonSummary({ cells = 4 }: { cells?: number }) {
  return (
    <div className="summary-strip" aria-hidden>
      {Array.from({ length: cells }, (_, index) => (
        <div className="summary-cell" key={index}>
          <span className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <div className="summary-copy">
            <Skeleton className="skeleton-line" width="52%" />
            <Skeleton className="skeleton-line" width="76%" height={18} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 列表骨架：模拟会话行 / 成果行的形态 */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <div className="summary-copy" style={{ flex: 1 }}>
            <Skeleton className="skeleton-line" width={`${64 - index * 4}%`} />
            <Skeleton className="skeleton-line" width="38%" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 首屏骨架：页头 + 汇总条 + 列表，替代只显示一个转圈 */
export function SkeletonPage({ cells = 4, rows = 5 }: { cells?: number; rows?: number }) {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在读取本机 AI 会话日志…</span>
      {cells > 0 ? <SkeletonSummary cells={cells} /> : null}
      <SkeletonList rows={rows} />
    </div>
  )
}
