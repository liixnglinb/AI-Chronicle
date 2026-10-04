import { ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { classNames } from '../lib/utils'

interface DataStateBannerProps {
  onGoToSources: () => void
}

/** 采集阶段序列：与主进程 ingest.cjs 的 PHASES 一一对应 */
const PHASE_STEPS: Array<{ phase: IngestPhase; label: string }> = [
  { phase: 'enumerate', label: '枚举文件' },
  { phase: 'parse', label: '解析日志' },
  { phase: 'artifacts', label: '挂载成果' },
  { phase: 'done', label: '完成' },
]

/**
 * 全局采集状态横幅。
 * 三种态：采集中（含阶段感知时间线）/ 采集失败 / 部分来源异常（单源告警）。
 * 「重试采集」与「排查数据源」是两个明确出口，不让用户干等。
 */
export function DataStateBanner({ onGoToSources }: DataStateBannerProps) {
  const { data, loading, error, isDesktop, refresh, progress } = useChronicle()
  if (!isDesktop) return null

  const failed = data?.sources.filter((source) => source.status === 'error') ?? []
  const tone: 'loading' | 'error' | 'partial' | null = error
    ? 'error'
    : loading
      ? 'loading'
      : failed.length
        ? 'partial'
        : null
  if (!tone) return null

  const activeIndex = progress ? PHASE_STEPS.findIndex((s) => s.phase === progress.phase) : -1
  const failedNames = failed.map((s) => s.name)

  return (
    <section
      className="desk-state-banner desk-enter"
      data-tone={tone}
      aria-label="采集状态"
      aria-busy={loading}
    >
      <div className="desk-banner-content">
        <span className="desk-banner-icon">
          {tone === 'loading' ? (
            <RefreshCw size={15} className="desk-spinning" />
          ) : (
            <TriangleAlert size={15} />
          )}
        </span>
        <div className="desk-banner-text">
          <strong>
            {tone === 'error'
              ? '本次采集未完成'
              : tone === 'loading'
                ? data
                  ? '正在更新采集结果'
                  : '正在读取本地来源'
                : `${failedNames.length} 个数据源暂不可读`}
          </strong>
          <span>
            {error
              ? error
              : tone === 'loading'
                ? (progress?.detail ?? '首次采集需要枚举本机会话文件，请稍候。')
                : `${failedNames.join('、')}。其余来源的记录仍可正常使用。`}
          </span>
        </div>
      </div>

      {tone === 'loading' && progress && (
        <div className="desk-pipeline" role="status" aria-live="polite">
          {PHASE_STEPS.map((step, index) => (
            <span key={step.phase} className="desk-pipeline-fragment">
              <span
                className={classNames(
                  'desk-pipeline-step',
                  index < activeIndex && 'is-done',
                  index === activeIndex && 'is-active',
                )}
              >
                {index < activeIndex ? '✓' : index === activeIndex ? '▸' : '·'} {step.label}
              </span>
              {index < PHASE_STEPS.length - 1 && <span className="desk-pipeline-sep">›</span>}
            </span>
          ))}
        </div>
      )}

      <div className="desk-banner-actions">
        {tone !== 'loading' && (
          <button onClick={() => void refresh(true)} className="desk-banner-action-btn">
            <RefreshCw size={12} />
            <span>重试采集</span>
          </button>
        )}
        <button onClick={onGoToSources} className="desk-banner-link-btn">
          <span>排查数据源</span>
          <ChevronRight size={12} />
        </button>
      </div>
    </section>
  )
}
