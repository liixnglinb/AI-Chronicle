import { classNames } from '../lib/utils'

interface SkeletonPageProps {
  /** 顶部指标矩阵占位块数量，0 表示不渲染 */
  cards?: number
  /** 列表行占位数量 */
  rows?: number
  /** 是否渲染顶部横幅占位 */
  banner?: boolean
}

/**
 * 首屏骨架：栅格与真实内容一致，加载完成时不跳版。
 * 采集是本地 IO，首屏通常 1~3 秒，这段时间必须有东西可看。
 */
export function SkeletonPage({ cards = 3, rows = 4, banner = true }: SkeletonPageProps) {
  return (
    <div className="desk-skeleton-page" aria-busy="true">
      <span className="sr-only">正在读取本机 AI 会话日志…</span>
      {banner && <div className="desk-skeleton-banner" />}
      {cards > 0 && (
        <div className="desk-skeleton-grid">
          {Array.from({ length: cards }, (_, index) => (
            <div className="desk-skeleton-card" key={index} />
          ))}
        </div>
      )}
      <div className="desk-skeleton-list">
        {Array.from({ length: rows }, (_, index) => (
          <div className="desk-skeleton-row" key={index} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonInline({ className }: { className?: string }) {
  return <span className={classNames('desk-skeleton-row', className)} aria-hidden />
}
