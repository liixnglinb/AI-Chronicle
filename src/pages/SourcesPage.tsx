import { useMemo, useState } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'
import { openLocalPath } from '../lib/desktop'
import { SourceHealthBadge } from '../components/SourceHealthBadge'
import { ConfirmDialog } from '../components/Modal'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { SourceRecord, ToastMessage } from '../types'

interface ScanSourceResult {
  id: string
  exists: boolean
  filesToday: number
  lastModified?: string
}

interface SourcesPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

/**
 * 接入中心：数据源全景阵列。
 *
 * 关键设计：不再把未接入的源画成一块置灰卡片。
 * 每个源都要回答四个问题 ——
 *   1. 本机路径是否存在（真实路径，不是文案）
 *   2. 用什么协议读（JSONL / SQLite 只读 / Zstd）
 *   3. 读到多少（会话数、最近活动）
 *   4. 为什么读不到（未适配的具体原因 + 接入指导）
 */
export function SourcesPage({ searchQuery, onToast }: SourcesPageProps) {
  const { data, loading, isDesktop, refresh } = useChronicle()
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanSourceResult[] | null>(null)
  const [confirmRescan, setConfirmRescan] = useState(false)
  const [rescanning, setRescanning] = useState(false)

  const sources = useMemo(() => data?.sources ?? [], [data])

  const q = searchQuery.trim().toLowerCase()
  const visibleSources = useMemo(() => {
    if (!q) return sources
    return sources.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.detail.toLowerCase().includes(q) ||
        (s.hint ?? '').toLowerCase().includes(q) ||
        (s.paths ?? []).some((p) => p.resolved.toLowerCase().includes(q)),
    )
  }, [sources, q])

  const connected = visibleSources.filter((s) => s.status === 'connected')
  const others = visibleSources.filter((s) => s.status !== 'connected')

  async function handleScan() {
    if (!window.desktopAPI) return
    setScanning(true)
    try {
      const result = await window.desktopAPI.scanSources()
      setScanResult(result.sources)
      onToast({
        tone: 'success',
        title: '数据源校验完成',
        message: `已检查 ${result.sources.length} 个接入目录的存在性与今日写入。`,
      })
    } finally {
      setScanning(false)
    }
  }

  async function runRescan() {
    setRescanning(true)
    try {
      const ok = await refresh(true)
      setConfirmRescan(false)
      if (!ok) return
      onToast({
        tone: 'success',
        title: '已重新采集',
        message: '采集结果已更新；异常来源可在下方查看具体原因。',
      })
    } finally {
      setRescanning(false)
    }
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="接入中心"
        description="接入状态来自本机各 AI 软件的会话日志目录，浏览器预览无法读取。"
      />
    )
  }

  if (loading && !data) return <SkeletonPage cards={4} rows={4} banner={false} />

  if (!data) {
    return (
      <EmptyState
        title="还没有采集结果"
        description="点击「强制重新采集」读取本机各 AI 软件的会话日志。"
        actions={
          <button onClick={() => setConfirmRescan(true)} className="desk-btn-primary">
            <RefreshCw size={13} />
            <span>强制重新采集</span>
          </button>
        }
      />
    )
  }

  const failedSources = sources.filter((s) => s.status === 'error')

  return (
    <div className="desk-sources-container">
      <div className="desk-sources-toolbar">
        <div>
          <h2>本机 AI 接入生态全景</h2>
          <p>
            只读直连本地 JSONL / SQLite 会话归档，无侵入、不抓取模型输出敏感原文。 共探测{' '}
            {sources.length} 个来源，其中 {sources.filter((s) => s.status === 'connected').length}{' '}
            个正常直连
            {failedSources.length > 0 && `，${failedSources.length} 个解析异常`}。
          </p>
        </div>
        <div className="desk-kpi-actions">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="desk-btn-secondary"
            title="逐一检查目录存在性与今日写入"
          >
            <FolderOpen size={13} className={scanning ? 'desk-spinning' : ''} />
            <span>{scanning ? '校验中' : '校验数据源'}</span>
          </button>
          <button onClick={() => setConfirmRescan(true)} className="desk-btn-primary">
            <RefreshCw size={13} />
            <span>强制重新采集</span>
          </button>
        </div>
      </div>

      {scanResult && (
        <div className="desk-scan-list">
          {scanResult.map((item) => {
            const meta = sources.find((s) => `source-${s.id}` === item.id || s.id === item.id)
            return (
              <div className="desk-scan-row" key={item.id}>
                <strong>{meta?.name ?? item.id}</strong>
                <span className={classNames(item.exists ? 'desk-faint' : 'desk-badge-danger')}>
                  {item.exists ? '目录存在' : '目录不存在'}
                </span>
                <span>今日写入 {item.filesToday} 个文件</span>
                {item.lastModified && <span>最近修改 {item.lastModified}</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* 活跃数据源阵列 */}
      {connected.length > 0 && (
        <section className="desk-source-section">
          <h3 className="desk-sec-label">活跃数据源（{connected.length}）</h3>
          <div className="desk-source-grid">
            {connected.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </section>
      )}

      {/* 监测中与未配置环境 */}
      {others.length > 0 && (
        <section className="desk-source-section">
          <h3 className="desk-sec-label">监测中与未配置环境（{others.length}）</h3>
          <div className="desk-source-grid">
            {others.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </section>
      )}

      {visibleSources.length === 0 && q && (
        <EmptyState
          title="没有匹配的数据源"
          description={`过滤词「${searchQuery}」没有命中任何来源的名称、路径或说明。`}
        />
      )}

      {confirmRescan && (
        <ConfirmDialog
          title="强制重新采集？"
          description="这会清空会话解析缓存，并重新扫描全部接入来源。"
          impacts={[
            '本机日志文件本身不会被修改，读取始终是只读操作',
            `当前已解析 ${data.sessions.length} 个会话，重新采集后数量应当一致`,
            '全量扫描通常需要 3~15 秒，期间界面会显示阶段进度',
          ]}
          confirmText="重新采集"
          loading={rescanning}
          onConfirm={() => void runRescan()}
          onCancel={() => setConfirmRescan(false)}
        />
      )}
    </div>
  )
}

/** 单个数据源卡片：路径 / 协议 / 读到的量 / 读不到的原因，四件事一次说清 */
function SourceCard({ source }: { source: SourceRecord }) {
  const isLive = source.status === 'connected'
  const paths = source.paths ?? []

  return (
    <div className={classNames('desk-source-card', isLive ? 'connected' : 'observing')}>
      <div className="desk-source-head">
        <span className="desk-source-title">{source.name}</span>
        <SourceHealthBadge source={source} />
      </div>

      {isLive && (
        <div className="desk-source-metrics">
          <div className="desk-sm-item">
            <small>累计会话</small>
            <strong>{source.sessionCount}</strong>
          </div>
          <div className="desk-sm-item">
            <small>最新活动</small>
            <span>{source.lastActivity ? formatClock(source.lastActivity) : '无'}</span>
          </div>
        </div>
      )}

      {/* 真实探测路径：存在与否一眼可辨，点击可打开所在目录 */}
      {paths.length > 0 && (
        <div className="desk-source-proto">
          {paths.map((p) => (
            <button
              key={p.resolved}
              className={classNames('desk-source-path', !p.exists && 'is-missing')}
              title={`${p.exists ? '已检测到，点击打开所在目录' : '本机未检测到该路径'}\n${p.resolved}`}
              onClick={() => void openLocalPath(p.exists ? p.resolved : p.spec)}
              style={{
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {p.exists ? '●' : '○'} {p.resolved}
            </button>
          ))}
        </div>
      )}

      {source.detail && <p className="desk-source-detail">{source.detail}</p>}
      {source.hint && <p className="desk-source-note">期望结构：{source.hint}</p>}
      {!isLive && !source.detail && (
        <p className="desk-source-note">本机未扫描到可解析的会话归档。</p>
      )}
    </div>
  )
}
