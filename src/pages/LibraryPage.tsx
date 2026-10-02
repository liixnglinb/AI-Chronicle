import { useMemo, useState } from 'react'
import {
  Database,
  File,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  FolderKanban,
  HardDrive,
  LayoutGrid,
} from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabel, formatTimeRange, shortenPath } from '../lib/format'
import { useIncrementalList } from '../lib/useIncrementalList'
import { ToolDot } from '../components/ToolDot'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SummaryStrip } from '../components/SummaryStrip'
import { Select } from '../components/Field'
import { LoadMore } from '../components/Progress'
import { SkeletonPage } from '../components/Skeleton'
import { classNames } from '../lib/utils'
import type { ArtifactRecord } from '../types'
import type { LucideIcon } from 'lucide-react'
import { ICON_SIZE } from '../lib/ui'

interface LibraryPageProps {
  searchQuery: string
}

type ArtifactKind = 'all' | 'code' | 'doc' | 'image' | 'video' | 'data'
type ArtifactSort = 'recent' | 'name' | 'size'

interface ArtifactRow extends ArtifactRecord {
  kind: ArtifactKind
  tool: string
  toolName: string
  toolColor: string
  project: string
  projectPath: string
  sessionTitle: string
  range: string
  start: number
  day: string
  /** 相对项目目录的短路径，用于列表展示 */
  shortPath: string
}

const TEXT_EXT = new Set(['.md', '.txt', '.doc', '.docx', '.pdf', '.csv', '.json', '.yaml', '.yml'])
const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.cjs',
  '.mjs',
  '.java',
  '.kt',
  '.go',
  '.rs',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.swift',
  '.html',
  '.css',
  '.scss',
  '.sql',
  '.sh',
  '.bat',
  '.ps1',
  '.vue',
  '.dart',
  '.php',
  '.rb',
])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi'])
const DATA_EXT = new Set(['.db', '.sqlite', '.csv', '.xlsx', '.json'])

const KIND_OPTIONS: Array<[ArtifactKind, string]> = [
  ['all', '全部'],
  ['code', '代码'],
  ['doc', '文档'],
  ['image', '图像'],
  ['video', '视频'],
  ['data', '数据'],
]

const SORT_OPTIONS: Array<[ArtifactSort, string]> = [
  ['recent', '最近'],
  ['name', '名称'],
  ['size', '大小'],
]

function kindOf(name: string): ArtifactKind {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (CODE_EXT.has(ext)) return 'code'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (DATA_EXT.has(ext)) return 'data'
  if (TEXT_EXT.has(ext)) return 'doc'
  return 'doc'
}

function iconForExt(name: string): { Icon: LucideIcon; tone: string } {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (VIDEO_EXT.has(ext)) return { Icon: FileVideo, tone: 'var(--violet)' }
  if (IMAGE_EXT.has(ext)) return { Icon: FileImage, tone: 'var(--amber)' }
  if (CODE_EXT.has(ext)) return { Icon: FileCode2, tone: 'var(--blue)' }
  if (TEXT_EXT.has(ext)) return { Icon: FileText, tone: 'var(--coral)' }
  if (DATA_EXT.has(ext)) return { Icon: Database, tone: 'var(--green)' }
  return { Icon: File, tone: 'var(--text-faint)' }
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function LibraryPage({ searchQuery }: LibraryPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [kind, setKind] = useState<ArtifactKind>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [toolFilter, setToolFilter] = useState('all')
  const [sort, setSort] = useState<ArtifactSort>('recent')

  const rows = useMemo<ArtifactRow[]>(() => {
    const list: ArtifactRow[] = []
    for (const s of data?.sessions ?? []) {
      for (const a of s.artifacts ?? []) {
        list.push({
          ...a,
          kind: kindOf(a.name),
          tool: s.tool,
          toolName: s.toolName,
          toolColor: s.toolColor,
          project: s.project,
          projectPath: s.projectPath,
          sessionTitle: s.title,
          range: formatTimeRange(s.start, s.end),
          start: s.start || 0,
          day: s.start ? dayKeyOf(s.start) : '',
          shortPath: shortenPath(a.path, s.projectPath),
        })
      }
    }

    const byPath = new Map<string, ArtifactRow>()
    for (const row of list.sort((a, b) => b.mtime - a.mtime)) {
      if (!byPath.has(row.path)) byPath.set(row.path, row)
    }
    return [...byPath.values()]
  }, [data])

  const projects = useMemo(() => {
    return [...new Set(rows.map((row) => row.project))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [rows])

  const tools = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>()
    for (const row of rows) {
      const item = map.get(row.tool) || { name: row.toolName, color: row.toolColor, count: 0 }
      item.count += 1
      map.set(row.tool, item)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [rows])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const result = rows.filter((row) => {
      if (kind !== 'all' && row.kind !== kind) return false
      if (projectFilter !== 'all' && row.project !== projectFilter) return false
      if (toolFilter !== 'all' && row.tool !== toolFilter) return false
      if (!query) return true
      return (
        row.name.toLowerCase().includes(query) ||
        row.path.toLowerCase().includes(query) ||
        row.project.toLowerCase().includes(query) ||
        row.toolName.toLowerCase().includes(query)
      )
    })

    return result.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
      if (sort === 'size') return b.size - a.size
      return b.mtime - a.mtime
    })
  }, [rows, searchQuery, kind, projectFilter, toolFilter, sort])

  // 成果集可能上百行，首屏只渲染前 40 行，其余按需追加
  const {
    visibleItems: visibleRows,
    hasMore,
    remaining,
    loadMore,
  } = useIncrementalList(filtered, {
    pageSize: 40,
    resetKey: `${kind}|${projectFilter}|${toolFilter}|${sort}|${searchQuery}`,
  })

  const byDay = useMemo(() => {
    const map = new Map<string, ArtifactRow[]>()
    for (const row of visibleRows) {
      const key = row.day || '未知日期'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [visibleRows])

  const totalSize = filtered.reduce((sum, row) => sum + row.size, 0)
  const projectCount = new Set(filtered.map((row) => row.project)).size
  const toolCount = new Set(filtered.map((row) => row.tool)).size

  async function open(row: ArtifactRow) {
    setOpenPath(row.path)
    const result = await window.desktopAPI?.openPath(row.path)
    if (result && !result.ok) {
      setOpenPath(null)
    }
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="成果集"
        description="成果集从本机会话对应的项目目录里提取真实产出文件。"
      />
    )
  }

  return (
    <div className="page">
      <PageHeader
        kicker={
          filtered.length
            ? `${filtered.length} 个文件 · ${projectCount} 个项目 · 点击可直接打开`
            : '从会话对应的项目目录提取会话期间改动过的文件'
        }
        title="成果集"
      />

      {rows.length > 0 && (
        <SummaryStrip
          items={[
            {
              key: 'files',
              label: '文件总数',
              value: filtered.length,
              icon: <FileText size={ICON_SIZE.sm} />,
              tone: 'primary',
            },
            {
              key: 'projects',
              label: '涉及项目',
              value: projectCount,
              icon: <FolderKanban size={ICON_SIZE.sm} />,
            },
            {
              key: 'tools',
              label: '产出软件',
              value: toolCount,
              icon: <LayoutGrid size={ICON_SIZE.sm} />,
            },
            {
              key: 'size',
              label: '总体积',
              value: formatSize(totalSize),
              icon: <HardDrive size={ICON_SIZE.sm} />,
              compact: true,
            },
          ]}
        />
      )}

      <div className="collection-toolbar">
        <div className="filter-chip-scroll">
          {KIND_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={classNames('filter-chip', kind === value && 'filter-chip-active')}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="collection-selects">
          <Select
            aria-label="筛选项目"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">全部项目</option>
            {projects.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </Select>
          <Select
            aria-label="筛选软件"
            value={toolFilter}
            onChange={(event) => setToolFilter(event.target.value)}
          >
            <option value="all">全部软件</option>
            {tools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name}
              </option>
            ))}
          </Select>
          <div className="segmented-control" aria-label="排序方式">
            {SORT_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={classNames(sort === value && 'segmented-active')}
                onClick={() => setSort(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data && <SkeletonPage cells={4} rows={6} />}

      {data && filtered.length === 0 && (
        <EmptyState
          title="没有匹配的成果"
          description="成果是会话时间窗内项目目录里被实际改动的文件。调整筛选条件后重试，或产生新会话后点「重新采集」。"
        />
      )}

      {byDay.map(([day, list]) => (
        <section className="session-section" key={day}>
          <div className="section-title-row">
            <span className="eyebrow">{day === '未知日期' ? day : formatDayLabel(day)}</span>
            <span className="result-count">{list.length} 个文件</span>
          </div>
          <div className="artifact-list">
            {list.map((row) => {
              const { Icon, tone } = iconForExt(row.name)
              const isOpen = openPath === row.path
              return (
                <button
                  key={row.path}
                  type="button"
                  className={classNames(
                    'artifact-row',
                    'list-item-enter',
                    isOpen && 'artifact-row-open',
                  )}
                  onClick={() => void open(row)}
                  title={row.path}
                >
                  <span className="artifact-row-icon" style={{ color: tone }}>
                    <Icon size={ICON_SIZE.sm} />
                  </span>
                  <span className="artifact-row-main">
                    <span className="artifact-row-name">{row.name}</span>
                    <span className="artifact-row-path">{row.shortPath}</span>
                  </span>
                  <span className="artifact-row-meta">
                    <ToolDot color={row.toolColor} name={row.toolName} />
                    <span title={row.project}>{row.project}</span>
                    <span>{row.range}</span>
                    <span>{formatSize(row.size)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {hasMore && <LoadMore noun="文件" remaining={remaining} onClick={loadMore} />}
    </div>
  )
}
