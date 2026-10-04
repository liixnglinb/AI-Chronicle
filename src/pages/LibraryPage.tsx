import { useMemo, useState } from 'react'
import {
  ArrowUpDown,
  Database,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
} from 'lucide-react'
import { useChronicle } from '../lib/store'
import { formatClock, shortenPath } from '../lib/format'
import { projectDisplayName } from '../lib/paths'
import { useIncrementalList } from '../lib/useIncrementalList'
import { openLocalPath } from '../lib/desktop'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { ArtifactRecord } from '../types'

interface LibraryPageProps {
  searchQuery: string
  onClearSearch: () => void
}

type KindCategory = 'all' | 'code' | 'doc' | 'image' | 'video' | 'data' | 'other'

interface FlatArtifact extends ArtifactRecord {
  toolName: string
  toolColor: string
  sessionTitle: string
  project: string
  projectPath: string
  kind: KindCategory
}

const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.rs',
  '.py',
  '.go',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.swift',
  '.go',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.vue',
  '.svelte',
  '.dart',
  '.php',
  '.rb',
  '.sh',
  '.bat',
  '.ps1',
  '.sql',
])
const DOC_EXT = new Set([
  '.md',
  '.txt',
  '.pdf',
  '.doc',
  '.docx',
  '.rtf',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi'])
const DATA_EXT = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.env',
  '.csv',
  '.xml',
  '.db',
  '.sqlite',
])

function extOf(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx < 0 ? '' : name.slice(idx).toLowerCase()
}

function resolveKind(fileName: string): KindCategory {
  const ext = extOf(fileName)
  if (CODE_EXT.has(ext)) return 'code'
  if (DOC_EXT.has(ext)) return 'doc'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (DATA_EXT.has(ext)) return 'data'
  // 未识别的扩展名不硬塞进某一类：单独归为 other，避免「其他」类文件里全是代码
  return 'other'
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

const KIND_META: Record<KindCategory, { label: string; Icon: typeof File; tone: string }> = {
  all: { label: '全部', Icon: File, tone: 'other' },
  code: { label: '代码', Icon: FileCode2, tone: 'code' },
  doc: { label: '文档', Icon: FileText, tone: 'doc' },
  image: { label: '图像', Icon: FileImage, tone: 'image' },
  video: { label: '视频', Icon: FileVideo, tone: 'video' },
  data: { label: '数据与配置', Icon: Database, tone: 'data' },
  other: { label: '其他', Icon: File, tone: 'other' },
}

/**
 * 成果集：表格化分类列表。
 * 每一行都标明「哪个项目、哪个软件、哪个会话」产生的这个文件，
 * 并提供「打开文件」与「在文件夹中定位」双入口。
 */
export function LibraryPage({ searchQuery, onClearSearch }: LibraryPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [kindFilter, setKindFilter] = useState<KindCategory>('all')
  const [sortBy, setSortBy] = useState<'mtime' | 'size'>('mtime')

  const allSessions = useMemo(() => data?.sessions ?? [], [data])

  const allProjectPaths = useMemo(
    () => allSessions.map((s) => s.projectPath || s.project).filter(Boolean),
    [allSessions],
  )

  // 展平所有会话内捕获的成果文件，同一路径只保留最近一次
  const allArtifacts = useMemo(() => {
    const byPath = new Map<string, FlatArtifact>()
    const list: FlatArtifact[] = []
    for (const s of allSessions) {
      for (const art of s.artifacts ?? []) {
        list.push({
          ...art,
          toolName: s.toolName,
          toolColor: s.toolColor,
          sessionTitle: s.title,
          project: s.project,
          projectPath: s.projectPath,
          kind: resolveKind(art.name),
        })
      }
    }
    list.sort((a, b) => b.mtime - a.mtime)
    for (const item of list) {
      if (byPath.has(item.path)) continue
      byPath.set(item.path, item)
    }
    return [...byPath.values()]
  }, [allSessions])

  const kindCounts = useMemo(() => {
    const counts = new Map<KindCategory, number>()
    for (const item of allArtifacts) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
    }
    return counts
  }, [allArtifacts])

  const filteredList = useMemo(() => {
    let list = allArtifacts
    if (kindFilter !== 'all') {
      list = list.filter((item) => item.kind === kindFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q) ||
          item.project.toLowerCase().includes(q) ||
          item.toolName.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => (sortBy === 'size' ? b.size - a.size : b.mtime - a.mtime))
  }, [allArtifacts, kindFilter, searchQuery, sortBy])

  const { visibleItems, hasMore, loadMore, remaining } = useIncrementalList(filteredList, {
    pageSize: 40,
    resetKey: `${kindFilter}_${sortBy}_${searchQuery}`,
  })

  async function openArtifact(path: string) {
    await openLocalPath(path)
  }

  async function revealInFolder(path: string) {
    // 在文件夹中定位：取所在目录交给系统文件管理器
    const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
    const dir = idx > 0 ? path.slice(0, idx) : path
    await openLocalPath(dir)
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="成果集"
        description="成果集从本机会话对应的项目目录里提取真实产出文件。"
      />
    )
  }

  if (loading && !data) return <SkeletonPage cards={0} rows={6} banner={false} />

  if (allArtifacts.length === 0) {
    return (
      <EmptyState
        title="暂无捕获的成果产出文件"
        description="当 AI 会话在其时间窗内修改或生成了本地代码和文档时，记录将在此呈现。"
      />
    )
  }

  const visibleKinds: KindCategory[] = ['all', 'code', 'doc', 'image', 'video', 'data']

  return (
    <div className="desk-library-shell">
      <div className="desk-library-toolbar">
        <div className="desk-pill-group">
          {visibleKinds.map((kind) => {
            const meta = KIND_META[kind]
            const count = kind === 'all' ? allArtifacts.length : (kindCounts.get(kind) ?? 0)
            if (kind !== 'all' && count === 0) return null
            return (
              <button
                key={kind}
                className={classNames('desk-pill-btn', kindFilter === kind && 'active')}
                onClick={() => setKindFilter(kind)}
                aria-pressed={kindFilter === kind}
              >
                {meta.label} ({count})
              </button>
            )
          })}
        </div>

        <div className="desk-sort-selector">
          <ArrowUpDown size={12} />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'mtime' | 'size')}
            className="desk-select"
            aria-label="排序方式"
          >
            <option value="mtime">按改动时间排序</option>
            <option value="size">按文件体积排序</option>
          </select>
        </div>
      </div>

      <div className="desk-panel desk-artifact-table-card">
        <div className="desk-art-table-head">
          <span className="desk-col-file">文件名 / 相对路径</span>
          <span>所属项目</span>
          <span className="desk-col-src">产生源</span>
          <span>关联会话</span>
          <span>改动时间</span>
          <span>大小</span>
          <span />
        </div>

        <div className="desk-art-table-body">
          {visibleItems.map((art) => {
            const meta = KIND_META[art.kind] ?? KIND_META.other
            const Icon = meta.Icon
            return (
              <div key={art.path} className="desk-art-row">
                <span className="desk-col-file" title={art.path}>
                  <Icon size={15} className={`desk-art-ico ${meta.tone}`} />
                  <span className="desk-file-name-meta">
                    <strong className="desk-fname">{art.name}</strong>
                    <span className="desk-fpath">
                      {shortenPath(art.path, art.projectPath || art.project)}
                    </span>
                  </span>
                </span>

                <span className="desk-proj-badge" title={art.projectPath}>
                  {projectDisplayName(art.projectPath || art.project, allProjectPaths)}
                </span>

                <span className="desk-col-src">
                  <span className="desk-src-tag" style={{ borderColor: art.toolColor }}>
                    <span className="desk-src-dot" style={{ backgroundColor: art.toolColor }} />
                    <span>{art.toolName}</span>
                  </span>
                </span>

                <span className="desk-col-session" title={art.sessionTitle}>
                  {art.sessionTitle || '（无标题会话）'}
                </span>

                <span className="desk-col-time">{formatClock(art.mtime)}</span>
                <span className="desk-col-size">{formatBytes(art.size)}</span>

                <span className="desk-col-action">
                  <button
                    onClick={() => void openArtifact(art.path)}
                    className="desk-art-btn"
                    title="直接打开此文件"
                    aria-label={`打开文件 ${art.name}`}
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button
                    onClick={() => void revealInFolder(art.path)}
                    className="desk-art-btn"
                    title="在文件夹中定位"
                    aria-label={`在文件夹中定位 ${art.name}`}
                  >
                    <FolderOpen size={12} />
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {filteredList.length === 0 && (
        <EmptyState
          title="没有匹配的成果"
          description="调整分类或过滤条件后重试。"
          actions={
            <button
              onClick={() => {
                setKindFilter('all')
                onClearSearch()
              }}
              className="desk-btn-secondary"
            >
              重置筛选
            </button>
          }
        />
      )}

      {hasMore && (
        <div className="desk-load-more-wrap">
          <button onClick={loadMore} className="desk-btn-ghost">
            显示更多产出（还有 {remaining} 个文件未展示）
          </button>
        </div>
      )}
    </div>
  )
}
