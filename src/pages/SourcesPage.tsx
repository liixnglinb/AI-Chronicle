import { RefreshCw } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'

const STATUS_TEXT: Record<string, string> = {
  connected: '已接入',
  observing: '观察中',
  absent: '未检测到',
  error: '异常',
}

export function SourcesPage() {
  const { data, loading, refresh } = useChronicle()

  const connected = data?.sources.filter((s) => s.status === 'connected') ?? []
  const others = data?.sources.filter((s) => s.status !== 'connected') ?? []

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {data
              ? `上次采集 ${formatClock(data.generatedAt)} · 缓存命中 ${data.cacheStats.hit} / 解析 ${data.cacheStats.miss}`
              : '读取本机各 AI 软件的会话日志'}
          </span>
          <strong>数据源</strong>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={() => refresh(true)}>
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
            强制重新采集
          </button>
        </div>
      </div>

      {!data && loading && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && (
        <>
          <section className="session-section">
            <div className="section-title-row">
              <span className="eyebrow">已接入（{connected.length}）</span>
              <span className="result-count">会话数为本机累计</span>
            </div>
            <div className="source-card-list">
              {connected.map((s) => (
                <div className="source-card" key={s.id}>
                  <div className="source-card-head">
                    <span className="status-dot status-healthy" />
                    <strong>{s.name}</strong>
                    <span className="source-count">{s.sessionCount} 会话</span>
                    {s.lastActivity && (
                      <span className="source-last">
                        最近活动 {new Date(s.lastActivity).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </div>
                  {s.detail && <div className="source-card-note">{s.detail}</div>}
                </div>
              ))}
            </div>
          </section>

          {others.length > 0 && (
            <section className="session-section">
              <div className="section-title-row">
                <span className="eyebrow">观察中 / 未接入（{others.length}）</span>
                <span className="result-count">诚实说明，不造假数据</span>
              </div>
              <div className="source-card-list">
                {others.map((s) => (
                  <div className="source-card muted" key={s.id}>
                    <div className="source-card-head">
                      <span
                        className={
                          s.status === 'error'
                            ? 'status-dot status-warning'
                            : 'status-dot status-paused'
                        }
                      />
                      <strong>{s.name}</strong>
                      <span className="source-status-text">{STATUS_TEXT[s.status] ?? s.status}</span>
                    </div>
                    <div className="source-card-note">{s.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
