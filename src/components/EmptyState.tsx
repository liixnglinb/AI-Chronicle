import type { ReactNode } from 'react'
import { Inbox, MonitorSmartphone } from 'lucide-react'
import { classNames } from '../lib/utils'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  /** 紧凑形态：用于面板内部，不撑开整页高度 */
  compact?: boolean
  actions?: ReactNode
}

/** 统一空状态：取代各页各自复制的空状态标记 */
export function EmptyState({
  title,
  description,
  icon,
  compact = false,
  actions,
}: EmptyStateProps) {
  return (
    <div className={classNames('desk-empty', compact && 'is-compact')}>
      <span className="desk-empty-icon">{icon ?? <Inbox size={22} />}</span>
      <strong className="desk-empty-title">{title}</strong>
      {description ? <span className="desk-empty-desc">{description}</span> : null}
      {actions ? <div className="desk-empty-actions">{actions}</div> : null}
    </div>
  )
}

/**
 * 浏览器预览环境下的整页占位。
 * 本应用的数据来自本机日志，只有桌面版（Electron）有文件访问权限。
 */
export function DesktopOnlyPage({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      icon={<MonitorSmartphone size={22} />}
      title={`${title} · 需要桌面版`}
      description={description}
    />
  )
}
