import { useState } from 'react'
import {
  FileClock,
  FolderCheck,
  MessageSquare,
  RadioTower,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SummaryStrip } from '../components/SummaryStrip'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Modal'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { ToastMessage } from '../types'
import { ICON_SIZE } from '../lib/ui'

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
  const { data, loading, isDesktop, refresh } = useChronicle()
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanSourceResult[] | null>(null)
  const [confirmRescan, setConfirmRescan] = useState(false)
  const [rescanning, setRescanning] = useState(false)

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

  async function runRescan() {
    setRescanning(true)
    try {
      const ok = await refresh(true)
      if (!ok) return
      setConfirmRescan(false)
      onToast({
        tone: 'success',
        title: '已重新采集',
        message: '采集结果已更新；异常来源可在接入中心查看。',
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

  return (
    <div className="page">
      <PageHeader
        kicker={
          data
            ? `上次采集 ${formatClock(data.generatedAt)} · 缓存命中 ${data.cacheStats.hit} / 解析 ${data.cacheStats.miss}`
            : '读取本机各 AI 软件的会话日志'
        }
        title="接入中心"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={ICON_SIZE.sm} />}
              onClick={() => setConfirmRescan(true)}
            >
              强制重新采集
            </Button>
            <Button
              variant="primary"
              icon={<ShieldCheck size={ICON_SIZE.sm} />}
              loading={scanning}
              onClick={() => void diagnoseSources()}
            >
              诊断来源
            </Button>
          </>
        }
      />

      {data && (
        <SummaryStrip
          items={[
            {
              key: 'connected',
              label: '已接入软件',
              value: connected.length,
              hint: `共 ${data.sources.length} 个来源`,
              icon: <RadioTower size={ICON_SIZE.sm} />,
              tone: 'primary',
            },
            {
              key: 'sessions',
              label: '累计会话',
              value: data.sessions.length,
              icon: <MessageSquare size={ICON_SIZE.sm} />,
            },
            {
              key: 'exists',
              label: '诊断目录存在',
              value: scanResult ? `${existingSources}/${scanResult.length}` : '—',
              hint: scanResult ? '目录可读' : '点「诊断来源」',
              icon: <FolderCheck size={ICON_SIZE.sm} />,
              compact: true,
            },
            {
              key: 'today',
              label: '今日日志写入',
              value: scanResult ? filesToday : '—',
              hint: scanResult ? '诊断后的文件数' : '点「诊断来源」',
              icon: <FileClock size={ICON_SIZE.sm} />,
            },
          ]}
        />
      )}

      {!data && loading && <SkeletonPage cells={4} rows={5} />}

      {data && (
        <>
          <section className="session-section">
            <div className="section-title-row">
              <span className="eyebrow">已接入（{connected.length}）</span>
              <span className="result-count">会话数为本机累计 · 可诊断目录写入状态</span>
            </div>
            <div className="source-card-list">
              {connected.map((source) => {
                const diagnostic = scanMap.get(source.id)
                return (
                  <div className="source-card" key={source.id}>
                    <div className="source-card-head">
                      <span className="status-dot status-healthy" />
                      <strong>{source.name}</strong>
                      <Badge>{source.sessionCount} 会话</Badge>
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
                {others.map((s) => {
                  const diagnostic = scanMap.get(s.id)
                  return (
                    <div className={classNames('source-card', 'muted')} key={s.id}>
                      <div className="source-card-head">
                        <span
                          className={classNames(
                            'status-dot',
                            s.status === 'error' ? 'status-warning' : 'status-paused',
                          )}
                        />
                        <strong>{s.name}</strong>
                        <span className="source-status-text">
                          {STATUS_TEXT[s.status] ?? s.status}
                        </span>
                      </div>
                      {s.detail && <div className="source-card-note">{s.detail}</div>}
                      {diagnostic && (
                        <div className="source-card-note">
                          诊断：{diagnostic.exists ? '目录存在' : '目录不存在'}
                          {diagnostic.lastModified ? ` · 最近修改 ${diagnostic.lastModified}` : ''}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!data && !loading && (
        <EmptyState
          title="还没有采集结果"
          description="点击「强制重新采集」读取本机各 AI 软件的会话日志。"
        />
      )}

      {confirmRescan && (
        <ConfirmDialog
          title="强制重新采集？"
          description="这会清空会话解析缓存，并重新扫描全部接入来源。"
          details={[
            '本机日志文件本身不会被修改，读取始终是只读操作',
            `当前已解析 ${data?.sessions.length ?? 0} 个会话，重新采集后数量应当一致`,
            '全量扫描通常需要 10–20 秒，期间界面可以继续使用',
          ]}
          confirmLabel="重新采集"
          loading={rescanning}
          onConfirm={() => void runRescan()}
          onCancel={() => setConfirmRescan(false)}
        />
      )}
    </div>
  )
}
