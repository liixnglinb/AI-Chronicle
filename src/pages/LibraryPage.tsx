import { useMemo, useState } from 'react'
import { FileCode2, FileImage, FileText, FileVideo, File, Database } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatDayLabel, formatTimeRange } from '../lib/format'
import { ToolDot } from '../components/ToolDot'
import type { ArtifactRecord } from '../types'
import type { LucideIcon } from 'lucide-react'

interface LibraryPageProps {
  searchQuery: string
}

interface ArtifactRow extends ArtifactRecord {
  tool: string
  toolName: string
  toolColor: string
  project: string
  sessionTitle: string
  range: string
  start: number
  day: string
}

const TEXT_EXT = new Set([
  '.md', '.txt', '.doc', '.docx', '.pdf', '.csv', '.json', '.yaml', '.yml',
])
const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.cjs', '.mjs', '.java', '.kt', '.go',
  '.rs', '.c', '.h', '.cpp', '.cs', '.swift', '.html', '.css', '.scss', '.sql',
  '.sh', '.bat', '.ps1', '.vue', '.dart', '.php', '.rb',
])
const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp',
])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi'])

function iconForExt(name: string): { Icon: LucideIcon; tone: string } {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (VIDEO_EXT.has(ext)) return { Icon: FileVideo, tone: 'var(--violet)' }
  if (IMAGE_EXT.has(ext)) return { Icon: FileImage, tone: 'var(--amber)' }
  if (CODE_EXT.has(ext)) return { Icon: FileCode2, tone: 'var(--blue)' }
  if (TEXT_EXT.has(ext)) return { Icon: FileText, tone: 'var(--coral)' }
  if (ext === '.db' || ext === '.sqlite' || ext === '.csv' || ext === '.xlsx') {
    return { Icon: Database, tone: 'var(--green)' }
  }
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

  const rows = useMemo<ArtifactRow[]>(() => {
    const list: ArtifactRow[] = []
    for (const s of data?.sessions ?? []) {
      for (const a of s.artifacts ?? []) {
        list.push({
          ...a,
          tool: s.tool,
          toolName: s.toolName,
          toolColor: s.toolColor,
          project: s.project,
          sessionTitle: s.title,
          range: formatTimeRange(s.start, s.end),
          start: s.start || 0,
          day: s.start ? dayKeyOf(s.start) : '',
        })
      }
    }
    // 同一文件可能被多个会话覆盖，按路径去重，保留最近的
    const byPath = new Map<string, ArtifactRow>()
    for (const r of list.sort((x, y) => y.mtime - x.mtime)) {
      if (!byPath.has(r.path)) byPath.set(r.path, r)
    }
    return [...byPath.values()].sort((x, y) => y.mtime - x.mtime)
  }, [data])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q) ||
        r.toolName.toLowerCase().includes(q),
    )
  }, [rows, searchQuery])

  const byDay = useMemo(() => {
    const map = new Map<string, ArtifactRow[]>()
    for (const r of filtered) {
      const key = r.day || '未知日期'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  async function open(f: ArtifactRow) {
    setOpenPath(f.path)
    const result = await window.desktopAPI?.openPath(f.path)
    if (result && !result.ok) {
      setOpenPath(null)
    }
  }

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="empty-state">
          <strong>需要桌面版</strong>
          <span>成果库从本机会话对应的项目目录里提取真实产出文件。</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            最近 3 天 · 从会话对应的项目目录提取「会话期间改动过的文件」
          </span>
          <strong>成果库</strong>
        </div>
        <div className="heading-actions">
          {rows.length > 0 && (
            <span className="result-count">{rows.length} 个文件</span>
          )}
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志…
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="empty-state">
          <strong>最近 3 天还没有提取到产出文件</strong>
          <span>
            成果 = 会话时间窗内项目目录里被实际改动的文件。产生新会话后回到这里查看；
            也可能是会话记录的工作目录已不存在。
          </span>
        </div>
      )}

      {byDay.map(([day, list]) => (
        <section className="session-section" key={day}>
          <div className="section-title-row">
            <span className="eyebrow">{formatDayLabel(day)}</span>
            <span className="result-count">{list.length} 个文件</span>
          </div>
          <div className="artifact-list">
            {list.map((f) => {
              const { Icon, tone } = iconForExt(f.name)
              const isOpen = openPath === f.path
              return (
                <button
                  key={f.path}
                  type="button"
                  className={isOpen ? 'artifact-row artifact-row-open' : 'artifact-row'}
                  onClick={() => void open(f)}
                  title={f.path}
                >
                  <span className="artifact-row-icon" style={{ color: tone }}>
                    <Icon size={17} />
                  </span>
                  <span className="artifact-row-main">
                    <span className="artifact-row-name">{f.name}</span>
                    <span className="artifact-row-path">{f.path}</span>
                  </span>
                  <span className="artifact-row-meta">
                    <ToolDot color={f.toolColor} name={f.toolName} />
                    <span>{f.project}</span>
                    <span>{f.range}</span>
                    <span>{formatSize(f.size)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
