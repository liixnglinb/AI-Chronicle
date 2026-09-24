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

export type Confidence = 'confirmed' | 'likely' | 'inferred' | 'duration'

export type TaskStatus = 'completed' | 'doing' | 'planned' | 'blocked'

export type ToolId =
  | 'codex'
  | 'qoder'
  | 'catpaw'
  | 'cursor'
  | 'trae'
  | 'pi'
  | 'doubao'
  | 'qianwen'
  | 'claude'
  | 'kimi'

export interface AiTool {
  id: ToolId
  name: string
  shortName: string
  color: string
  category: 'code' | 'chat' | 'media' | 'browser'
  status: 'connected' | 'degraded' | 'observing'
  confidence: Confidence
  usageMinutes: number
  sessions: number
  tokens: number
  source: string
  lastSync: string
}

export interface EvidenceItem {
  id: string
  label: string
  detail: string
  source: string
  time: string
}

export interface Workstream {
  id: string
  title: string
  summary: string
  project: string
  startMinute: number
  endMinute: number
  durationMinutes: number
  toolIds: ToolId[]
  confidence: Confidence
  status: 'completed' | 'active' | 'paused'
  achievement: string
  artifactIds: string[]
  evidence: EvidenceItem[]
}

export interface TaskItem {
  id: string
  title: string
  project: string
  status: TaskStatus
  priority: 'high' | 'medium' | 'low'
  date: string
  startMinute: number
  endMinute: number
  durationMinutes: number
  progress: number
  toolIds: ToolId[]
  summary: string
  result?: string
}

export interface HistoryDay {
  date: string
  day: number
  weekday: string
  minutes: number
  tasksCompleted: number
  tasksPlanned: number
  artifactCount: number
  sessionCount: number
  headline: string
  summary: string
  primaryProject: string
  toolIds: ToolId[]
}

export interface ActivityBlock {
  id: string
  toolId: ToolId
  title: string
  detail: string
  startMinute: number
  endMinute: number
  project: string
  confidence: Confidence
  sessionId: string
}

export interface Artifact {
  id: string
  name: string
  type: 'document' | 'code' | 'image' | 'video' | 'data'
  project: string
  path: string
  modifiedAt: string
  size: string
  toolIds: ToolId[]
  confidence: Confidence
  icon: LucideIcon
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  status: 'active' | 'paused' | 'completed'
  progress: number
  minutesThisWeek: number
  sessions: number
  color: string
  tools: ToolId[]
  artifacts: number
  lastActive: string
  nextStep: string
}

export interface AdapterSource {
  id: string
  name: string
  method: string
  status: 'healthy' | 'warning' | 'paused'
  confidence: Confidence
  lastSync: string
  recordsToday: number
  path: string
  note: string
}

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

export interface UpdateStatus {
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
