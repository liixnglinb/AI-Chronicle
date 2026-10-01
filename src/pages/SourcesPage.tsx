import { useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'
import type { ToastMessage } from '../types'

const STATUS_TEXT: Record<string, string> = {
  connected: '已接入',
  observing: '观察中',
  absent: '未检测到',
  error: '异常',
}

interface ScanSourceResult {
  id: string
  exists: boolean
  filesToday: number
  lastModified?: string
}

interface SourcesPageProps {
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function SourcesPage({ onToast }: SourcesPageProps) {
  const { data, loading, refresh } = useChronicle()
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanSourceResult[] | null>(null)

  const scanMap = new Map((scanResult ?? []).map((source) => [source.id, source]))
  const filesToday = (scanResult ?? []).reduce((sum, source) => sum + source.filesToday, 0)
  const existingSources = (scanResult ?? []).filter((source) => source.exists).length

  const connected = data?.sources.filter((s) => s.status === 'connected') ?? []
  const others = data?.sources.filter((s) => s.status !== 'connected') ?? []

  async function diagnoseSources() {
    if (!window.desktopAPI) return
    setScanning(true)
    try {
      const result = await window.desktopAPI.scanSources()
      setScanResult(result.sources)
      onToast({
        tone: 'success',
        title: '来源诊断完成',
        message: `已检查 ${result.sources.length} 个接入来源。`,
      })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {data
              ? `上次采集 ${formatClock(data.generatedAt)} · ${connected.length}/${data.sources.length} 来源可用 · 缓存命中 ${data.cacheStats.hit} / 解析 ${data.cacheStats.miss}`
              : '读取本机各 AI 软件的会话日志'}
          </span>
          <strong>接入中心</strong>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={() => refresh(true)}>
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
            强制重新采集
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void diagnoseSources()}
            disabled={scanning}
          >
            <ShieldCheck size={15} className={scanning ? 'spin' : undefined} />
            {scanning ? '诊断中' : '诊断来源'}
          </button>
        </div>
      </div>

      {data && (
        <div className="kpi-strip">
          <div className="kpi-card">
            <small>已接入软件</small>
            <strong>{connected.length}</strong>
          </div>
          <div className="kpi-card">
            <small>累计会话</small>
            <strong>{data.sessions.length}</strong>
          </div>
          <div className="kpi-card">
            <small>诊断后目录存在</small>
            <strong>{scanResult ? `${existingSources}/${scanResult.length}` : '—'}</strong>
          </div>
          <div className="kpi-card">
            <small>诊断后今日写入</small>
            <strong>{scanResult ? filesToday : '—'}</strong>
          </div>
        </div>
      )}

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
              <span className="result-count">会话数为本机累计，可诊断目录写入状态</span>
            </div>
            <div className="source-card-list">
              {connected.map((source) => {
                const diagnostic = scanMap.get(source.id)
                return (
                  <div className="source-card" key={source.id}>
                    <div className="source-card-head">
                      <span className="status-dot status-healthy" />
                      <strong>{source.name}</strong>
                      <span className="source-count">{source.sessionCount} 会话</span>
                      {source.lastActivity && (
                        <span className="source-last">
                          最近活动 {new Date(source.lastActivity).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </div>
                    {source.detail && <div className="source-card-note">{source.detail}</div>}
                    {diagnostic && (
                      <div className="source-card-note">
                        诊断：目录存在 · 今日 {diagnostic.filesToday} 个文件写入
                        {diagnostic.lastModified ? ` · 最近修改 ${diagnostic.lastModified}` : ''}
                      </div>
                    )}
                  </div>
                )
              })}
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
                    {scanMap.get(s.id) && (
                      <div className="source-card-note">
                        诊断：{scanMap.get(s.id)!.exists ? '目录存在' : '目录不存在'}
                        {scanMap.get(s.id)!.lastModified
                          ? ` · 最近修改 ${scanMap.get(s.id)!.lastModified}`
                          : ''}
                      </div>
                    )}
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
