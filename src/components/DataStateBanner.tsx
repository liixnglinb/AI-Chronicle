import { RefreshCw, RadioTower, TriangleAlert } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { Button } from './Button'

/** Persistent collection status shared by all pages, including initial errors. */
export function DataStateBanner({ onSources }: { onSources: () => void }) {
  const { data, loading, error, isDesktop, refresh } = useChronicle()
  if (!isDesktop) return null
  const failed = data?.sources.filter((source) => source.status === 'error') ?? []
  const state = error ? 'error' : loading ? 'loading' : failed.length ? 'partial' : null
  if (!state) return null
  const title = error
    ? '本次采集未完成'
    : loading
      ? data
        ? '正在更新采集结果'
        : '正在读取本地来源'
      : '部分来源暂不可读'
  const message =
    error ||
    (loading
      ? data
        ? '上次成功采集的内容仍可查看，请等待当前任务完成。'
        : '首次采集可能需要一些时间；完成后会显示真实会话与产物。'
      : failed.map((source) => source.name).join('、') + '。其他来源的记录仍可使用。')
  return (
    <section
      className={'data-state-banner data-state-' + state}
      aria-label="采集状态"
      aria-busy={loading}
    >
      <span className="data-state-icon" aria-hidden="true">
        {loading ? (
          <RefreshCw className="spinner-icon" size={18} />
        ) : error ? (
          <TriangleAlert size={18} />
        ) : (
          <RadioTower size={18} />
        )}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {error && data && <small>显示上次有效结果；失败不会清空已采集记录。</small>}
      </div>
      <div className="data-state-actions">
        {error && (
          <Button size="sm" disabled={loading} onClick={() => void refresh(true)}>
            重试采集
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSources}>
          查看接入中心
        </Button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {title}
      </span>
    </section>
  )
}
