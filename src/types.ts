import type { LucideIcon } from 'lucide-react'

export type ViewId =
  | 'today'
  | 'history'
  | 'timeline'
  | 'projects'
  | 'library'
  | 'insights'
  | 'sources'
  | 'settings'

export interface NavItem {
  id: ViewId
  label: string
  description: string
  icon: LucideIcon
}

export interface ToastMessage {
  id: number
  tone: 'success' | 'info' | 'warning'
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
}

// 会话与数据源的结构与 electron/ingest.cjs 输出保持一致
// （IngestSession / IngestSource / IngestData 以全局接口声明在 global.d.ts）

export type SessionRecord = IngestSession
export type SourceRecord = IngestSource
export type ChronicleData = IngestData
