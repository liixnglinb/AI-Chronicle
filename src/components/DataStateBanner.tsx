import { ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { useChronicle } from '../lib/store'

interface DataStateBannerProps {
  onGoToSources: () => void
}

/**
 * 全局采集状态横幅：只在「本次采集失败」或「部分来源不可读」时出现。
 * 采集进行中的进度由右上角心跳承担，不再抢占中间版面。
 */
export function DataStateBanner({ onGoToSources }: DataStateBannerProps) {
  const { data, error, isDesktop, refresh } = useChronicle()
  if (!isDesktop) return null

  const failed = data?.sources.filter((source) => source.status === 'error') ?? []
  const failedNames = failed.map((source) => source.name)
  const tone: 'error' | 'partial' | null = error ? 'error' : failedNames.length ? 'partial' : null
  if (!tone) return null

  return (
    <section
      className="desk-state-banner desk-enter"
      data-tone={tone}
      role="alert"
      aria-label="数据状态异常"
    >
      <div className="desk-banner-content">
        <span className="desk-banner-icon">
          <TriangleAlert size={15} />
        </span>
        <div className="desk-banner-text">
          <strong>
            {tone === 'error' ? '本次采集未完成' : `${failedNames.length} 个数据源暂不可读`}
          </strong>
          <span>{error ?? `${failedNames.join('、')}。其余来源的记录仍可正常使用。`}</span>
        </div>
      </div>

      <div className="desk-banner-actions">
        <button onClick={() => void refresh(true)} className="desk-banner-action-btn">
          <RefreshCw size={12} />
          <span>重试采集</span>
        </button>
        <button onClick={onGoToSources} className="desk-banner-link-btn">
          <span>排查数据源</span>
          <ChevronRight size={12} />
        </button>
      </div>
    </section>
  )
}
