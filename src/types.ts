import type { LucideIcon } from 'lucide-react'

export type ViewId =
  'today' | 'history' | 'timeline' | 'projects' | 'library' | 'insights' | 'sources' | 'settings'

export interface NavItem {
  id: ViewId
  label: string
  description: string
  icon: LucideIcon
}

export interface ToastMessage {
  id: number
  tone: 'success' | 'info' | 'warning' | 'danger'
  title: string
  message: string
}

export type UpdateStatus = {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'unavailable'
  version?: string
  percent?: number
  message?: string
  /** Release 说明（已转纯文本） */
  notes?: string
  /** 当前使用的更新源标签 */
  source?: string
  /** 用户主动跳过的版本号，供界面提供「恢复」入口 */
  skippedVersion?: string
  /** 是否自动下载更新包（安装包约 110 MB，默认关） */
  autoDownload?: boolean
  probes?: Array<{ id: string; label: string; ok: boolean; ms: number }>
}

// 会话与数据源的结构与 electron/ingest.cjs 输出保持一致
// （IngestSession / IngestSource / IngestData / SessionArtifact 以全局接口声明在 global.d.ts）

export type SessionRecord = IngestSession
export type SourceRecord = IngestSource
export type ChronicleData = IngestData
export type ArtifactRecord = SessionArtifact
