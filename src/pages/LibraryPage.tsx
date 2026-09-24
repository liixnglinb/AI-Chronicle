import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  Grid2X2,
  List,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { artifacts } from '../data/mockData'
import { openLocalPath } from '../lib/desktop'
import { artifactTypeLabels, classNames } from '../lib/utils'
import type { Artifact, ToastMessage } from '../types'
import { ConfidenceBadge, ToolStack } from '../components/StatusBadges'

interface LibraryPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type ArtifactFilter = 'all' | Artifact['type']

export function LibraryPage({ searchQuery, onToast }: LibraryPageProps) {
  const [filter, setFilter] = useState<ArtifactFilter>('all')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [selectedArtifact, setSelectedArtifact] = useState(artifacts[0])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent')

  const filteredArtifacts = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    const filtered = artifacts.filter((artifact) => {
      const typeMatches = filter === 'all' || artifact.type === filter
      const confidenceMatches = !confirmedOnly || artifact.confidence === 'confirmed'
      const textMatches =
        !normalized ||
        [artifact.name, artifact.project, artifact.path]
          .join(' ')
          .toLowerCase()
          .includes(normalized)
      return typeMatches && confidenceMatches && textMatches
    })
    return filtered.toSorted((left, right) => {
      if (sortBy === 'name') return left.name.localeCompare(right.name, 'zh-CN')
      if (sortBy === 'size') {
        return Number.parseFloat(right.size) - Number.parseFloat(left.size)
      }
      return right.modifiedAt.localeCompare(left.modifiedAt)
    })
  }, [confirmedOnly, filter, searchQuery, sortBy])

  async function openArtifact(artifact: Artifact) {
    setSelectedArtifact(artifact)
    const result = await openLocalPath(artifact.path)
    onToast({
      tone: result.ok ? 'success' : 'warning',
      title: result.ok ? `已处理 ${artifact.name}` : '无法打开成果',
      message: result.message ?? artifact.path,
    })
  }

  return (
    <div className="page library-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <CheckCircle2 size={14} />
            可追溯的产物
          </span>
          <h1>成果库</h1>
          <p>把文档、代码、图片和视频与生成它们的 AI 会话放在一起。</p>
        </div>
        <div className="heading-actions">
          <div className="view-toggle" role="group" aria-label="布局切换">
            <button
              type="button"
              className={classNames(layout === 'grid' && 'view-toggle-active')}
              onClick={() => setLayout('grid')}
              title="网格布局"
              aria-label="网格布局"
            >
              <Grid2X2 size={15} />
            </button>
            <button
              type="button"
              className={classNames(layout === 'list' && 'view-toggle-active')}
              onClick={() => setLayout('list')}
              title="列表布局"
              aria-label="列表布局"
            >
              <List size={15} />
            </button>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            <SlidersHorizontal size={14} />
            筛选
          </button>
        </div>
      </section>

      {advancedOpen && (
        <section className="surface library-advanced-filter">
          <div>
            <span className="section-kicker">高级筛选</span>
            <strong>缩小成果范围</strong>
          </div>
          <label className="filter-option">
            <input
              type="checkbox"
              checked={confirmedOnly}
              onChange={(event) => setConfirmedOnly(event.target.checked)}
            />
            仅显示已确认来源
          </label>
          <label className="filter-option">
            <span>排序</span>
            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as 'recent' | 'name' | 'size')
              }
            >
              <option value="recent">最近修改</option>
              <option value="name">文件名称</option>
              <option value="size">文件大小</option>
            </select>
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setConfirmedOnly(false)
              setSortBy('recent')
            }}
          >
            重置筛选
          </button>
        </section>
      )}

      <section className="library-toolbar">
        <div className="filter-chip-scroll">
          {(
            [
              ['all', '全部'],
              ['document', '文档'],
              ['code', '代码'],
              ['image', '图片'],
              ['video', '视频'],
              ['data', '数据'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={classNames('filter-chip', filter === value && 'filter-chip-active')}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="result-count">{filteredArtifacts.length} 个成果</span>
      </section>

      <div className="library-layout">
        <section className={classNames('artifact-grid', layout === 'list' && 'artifact-grid-list')}>
          {filteredArtifacts.map((artifact) => {
            const Icon = artifact.icon
            return (
              <article
                className={classNames(
                  'artifact-card',
                  selectedArtifact.id === artifact.id && 'artifact-card-selected',
                )}
                key={artifact.id}
              >
                <button
                  className="artifact-card-hitbox"
                  type="button"
                  onClick={() => setSelectedArtifact(artifact)}
                  aria-label={`打开 ${artifact.name}`}
                />
                <span
                  className={classNames(
                    'artifact-preview',
                    `artifact-preview-${artifact.type}`,
                  )}
                >
                  <Icon size={30} />
                  <small>{artifactTypeLabels[artifact.type]}</small>
                </span>
                <div className="artifact-card-copy">
                  <div className="artifact-name-row">
                    <strong>{artifact.name}</strong>
                    <button
                      className="icon-button"
                      type="button"
                      title="更多操作"
                      aria-label="更多操作"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openArtifact(artifact)
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                  <span>{artifact.project}</span>
                  <small>
                    {artifact.modifiedAt} · {artifact.size}
                  </small>
                </div>
                <footer>
                  <ToolStack toolIds={artifact.toolIds} />
                  <ConfidenceBadge confidence={artifact.confidence} compact />
                </footer>
              </article>
            )
          })}
        </section>

        <aside className="artifact-inspector">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">成果预览</span>
              <h3>{selectedArtifact.name}</h3>
            </div>
            <button
              className="icon-button"
              type="button"
              title="在资源管理器中打开"
              aria-label="在资源管理器中打开"
              onClick={() => void openArtifact(selectedArtifact)}
            >
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div
            className={classNames(
              'artifact-preview-large',
              `artifact-preview-${selectedArtifact.type}`,
            )}
          >
            {(() => {
              const Icon = selectedArtifact.icon
              return <Icon size={58} />
            })()}
            <span>{artifactTypeLabels[selectedArtifact.type]}</span>
          </div>
          <dl className="detail-list artifact-detail-list">
            <div>
              <dt>项目</dt>
              <dd>{selectedArtifact.project}</dd>
            </div>
            <div>
              <dt>路径</dt>
              <dd className="path-value">{selectedArtifact.path}</dd>
            </div>
            <div>
              <dt>修改时间</dt>
              <dd>{selectedArtifact.modifiedAt}</dd>
            </div>
            <div>
              <dt>文件大小</dt>
              <dd>{selectedArtifact.size}</dd>
            </div>
            <div>
              <dt>来源可信度</dt>
              <dd>
                <ConfidenceBadge confidence={selectedArtifact.confidence} compact />
              </dd>
            </div>
          </dl>
          <div className="artifact-evidence-card">
            <span className="evidence-icon">
              <Search size={15} />
            </span>
            <span>
              <strong>找到 3 条生成证据</strong>
              <small>会话、工具调用和文件修改可以相互印证。</small>
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}
