import { useState } from 'react'
import {
  Activity,
  Cable,
  CheckCircle2,
  CirclePause,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  RadioTower,
  TriangleAlert,
  X,
} from 'lucide-react'
import { sources } from '../data/mockData'
import type { AdapterSource, ToastMessage } from '../types'
import { classNames, confidenceLabels } from '../lib/utils'
import { ConfidenceBadge, StatusDot } from '../components/StatusBadges'

interface SourcesPageProps {
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function SourcesPage({ onToast }: SourcesPageProps) {
  const [selectedId, setSelectedId] = useState(sources[0].id)
  const [sourceList, setSourceList] = useState(sources)
  const [scanning, setScanning] = useState(false)
  const [pausedSources, setPausedSources] = useState<string[]>(['source-kimi'])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [detailMode, setDetailMode] = useState<'log' | 'history' | null>(null)
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourcePath, setNewSourcePath] = useState('')

  const selected =
    sourceList.find((source) => source.id === selectedId) ?? sourceList[0]
  const healthyCount = sourceList.filter((source) => source.status === 'healthy').length

  async function runScan() {
    setScanning(true)
    if (window.desktopAPI) {
      const result = await window.desktopAPI.scanSources()
      if (result.ok) {
        setSourceList((current) =>
          current.map((source) => {
            const scanned = result.sources.find((item) => item.id === source.id)
            if (!scanned) return source
            return {
              ...source,
              recordsToday: scanned.filesToday,
              lastSync: '刚刚',
              status: scanned.exists ? 'healthy' : 'warning',
              note: scanned.exists
                ? `最近修改 ${scanned.lastModified ?? '未知'}，路径检测正常。`
                : '未检测到数据路径，请检查软件是否已安装或登录。',
            }
          }),
        )
      }
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
    }
    setScanning(false)
    onToast({
      tone: 'success',
      title: '增量扫描完成',
      message: window.desktopAPI
        ? '已检查本机数据源路径并更新可用状态。'
        : '浏览器预览完成模拟扫描，读取 284 条演示事件。',
    })
  }

  function toggleSource(source: AdapterSource) {
    setPausedSources((current) => {
      const paused = current.includes(source.id)
      onToast({
        tone: paused ? 'success' : 'warning',
        title: paused ? `${source.name} 已恢复` : `${source.name} 已暂停`,
        message: paused ? '下一轮采集会重新读取该数据源。' : '现有历史记录会保留。',
      })
      return paused
        ? current.filter((id) => id !== source.id)
        : [...current, source.id]
    })
  }

  return (
    <div className="page sources-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <RadioTower size={14} />
            本地采集管道
          </span>
          <h1>数据源</h1>
          <p>每个软件独立适配、独立降级。单个解析失败不会中断其他数据源。</p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {scanning ? '正在扫描' : '立即扫描'}
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setAddModalOpen(true)}
          >
            <Plus size={15} />
            添加数据源
          </button>
        </div>
      </section>

      <section className="source-health-strip">
        <div>
          <span className="health-ring health-ring-green">
            <CheckCircle2 size={18} />
          </span>
          <span>
            <small>运行正常</small>
            <strong>{healthyCount}</strong>
          </span>
        </div>
        <div>
          <span className="health-ring health-ring-amber">
            <TriangleAlert size={18} />
          </span>
          <span>
            <small>需要关注</small>
            <strong>{sourceList.filter((source) => source.status === 'warning').length}</strong>
          </span>
        </div>
        <div>
          <span className="health-ring health-ring-neutral">
            <CirclePause size={18} />
          </span>
          <span>
            <small>已暂停</small>
            <strong>{pausedSources.length}</strong>
          </span>
        </div>
        <div className="source-health-progress">
          <span>
            <small>今日覆盖</small>
            <strong>96%</strong>
          </span>
          <div>
            <span style={{ width: '96%' }} />
          </div>
          <em>284 条事件已被写入本地库</em>
        </div>
      </section>

      <div className="sources-layout">
        <section className="surface source-table-surface">
          <header className="surface-header">
            <div>
              <span className="section-kicker">适配器列表</span>
              <h2>全部数据源</h2>
            </div>
            <span className="header-note">最后统一同步 13:28</span>
          </header>
          <div className="source-table">
            <div className="source-table-head">
              <span>软件</span>
              <span>采集方式</span>
              <span>状态</span>
              <span>今日</span>
              <span>同步</span>
              <span />
            </div>
            {sourceList.map((source) => {
              const paused = pausedSources.includes(source.id)
              return (
                <button
                  className={classNames(
                    'source-row',
                    selectedId === source.id && 'source-row-selected',
                  )}
                  key={source.id}
                  type="button"
                  onClick={() => setSelectedId(source.id)}
                >
                  <span className="source-name">
                    <span className="source-mono">{source.name.slice(0, 2).toUpperCase()}</span>
                    <span>
                      <strong>{source.name}</strong>
                      <small>{confidenceLabels[source.confidence]}</small>
                    </span>
                  </span>
                  <span className="source-method">{source.method}</span>
                  <span className="source-status">
                    <StatusDot status={paused ? 'paused' : source.status} />
                    {paused ? '已暂停' : source.status === 'healthy' ? '正常' : '需关注'}
                  </span>
                  <span className="source-records mono-text">{source.recordsToday}</span>
                  <span className="source-time">{source.lastSync}</span>
                  <span className="source-actions">
                    <span
                      className={classNames('toggle', !paused && 'toggle-on')}
                      role="switch"
                      aria-checked={!paused}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleSource(source)
                      }}
                    >
                      <span />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="source-detail">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">适配器详情</span>
              <h3>{selected.name}</h3>
            </div>
            <ConfidenceBadge confidence={selected.confidence} />
          </div>
          <div className="source-detail-orb">
            <Cable size={32} />
          </div>
          <p className="source-note">{selected.note}</p>
          <dl className="detail-list source-detail-list">
            <div>
              <dt>采集方式</dt>
              <dd>{selected.method}</dd>
            </div>
            <div>
              <dt>数据路径</dt>
              <dd className="path-value">{selected.path}</dd>
            </div>
            <div>
              <dt>最近同步</dt>
              <dd>{selected.lastSync}</dd>
            </div>
            <div>
              <dt>今日记录</dt>
              <dd>{selected.recordsToday} 条</dd>
            </div>
          </dl>
          <div className="source-detail-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setDetailMode('log')}
            >
              <Activity size={14} />
              查看解析日志
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setDetailMode('history')}
            >
              <Clock3 size={14} />
              查看历史
            </button>
          </div>
        </aside>
      </div>

      {addModalOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={() => setAddModalOpen(false)}
        >
          <form
            className="modal-card source-modal"
            onSubmit={(event) => {
              event.preventDefault()
              const name = newSourceName.trim()
              if (!name) return
              const newSource: AdapterSource = {
                id: `source-custom-${Date.now()}`,
                name,
                method: 'Local adapter candidate',
                status: 'warning',
                confidence: 'duration',
                lastSync: '刚刚',
                recordsToday: 0,
                path: newSourcePath.trim() || '等待选择数据路径',
                note: '新数据源已添加，需要完成一次解析验证。',
              }
              setSourceList((current) => [...current, newSource])
              setSelectedId(newSource.id)
              setAddModalOpen(false)
              setNewSourceName('')
              setNewSourcePath('')
              onToast({
                tone: 'success',
                title: '数据源已添加',
                message: `${name} 已进入待验证状态。`,
              })
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="section-kicker">适配器向导</span>
                <h2>添加本地数据源</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="关闭"
                aria-label="关闭"
                onClick={() => setAddModalOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <label>
              <span>软件名称</span>
              <input
                value={newSourceName}
                onChange={(event) => setNewSourceName(event.target.value)}
                placeholder="例如：OpenCode Desktop"
                autoFocus
                required
              />
            </label>
            <label>
              <span>数据目录或文件</span>
              <input
                value={newSourcePath}
                onChange={(event) => setNewSourcePath(event.target.value)}
                placeholder="%APPDATA%\\your-app"
              />
            </label>
            <p>
              桌面版会在保存后检测路径。浏览器预览仅记录配置，不会访问磁盘。
            </p>
            <footer>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setAddModalOpen(false)}
              >
                取消
              </button>
              <button className="button button-primary" type="submit">
                添加并验证
              </button>
            </footer>
          </form>
        </div>
      )}

      {detailMode && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={() => setDetailMode(null)}
        >
          <section
            className="modal-card source-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detailMode === 'log' ? '解析日志' : '同步历史'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="section-kicker">
                  {detailMode === 'log' ? '解析日志' : '同步历史'}
                </span>
                <h2>{selected.name}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="关闭"
                aria-label="关闭"
                onClick={() => setDetailMode(null)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="source-log-list">
              {detailMode === 'log' ? (
                <>
                  <div><span>13:28:01</span><strong>增量读取完成</strong><em>{selected.recordsToday} 条事件</em></div>
                  <div><span>13:27:58</span><strong>SQLite 快照创建成功</strong><em>12 ms</em></div>
                  <div><span>13:27:57</span><strong>开始解析 {selected.method}</strong><em>只读</em></div>
                </>
              ) : (
                <>
                  <div><span>今天</span><strong>{selected.recordsToday} 条记录</strong><em>正常</em></div>
                  <div><span>昨天</span><strong>176 条记录</strong><em>正常</em></div>
                  <div><span>09 / 22</span><strong>203 条记录</strong><em>正常</em></div>
                  <div><span>09 / 21</span><strong>188 条记录</strong><em>正常</em></div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
