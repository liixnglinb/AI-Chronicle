import type { ReactNode } from 'react'
import { Inbox, MonitorSmartphone } from 'lucide-react'
import { classNames } from '../lib/utils'
import { PageHeader } from './PageHeader'
import { ICON_SIZE } from '../lib/ui'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  tone?: 'neutral' | 'error'
  /** 紧凑形态：用于面板内部，不撑开整页高度 */
  compact?: boolean
}

/** 统一的空状态。取代此前 6 个页面里各自复制的空状态标记。 */
export function EmptyState({
  title,
  description,
  icon,
  tone = 'neutral',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={classNames(
        'empty-state',
        tone === 'error' && 'empty-state-error',
        compact && 'empty-state-compact',
      )}
    >
      <span className="empty-state-icon">{icon ?? <Inbox size={ICON_SIZE.lg} />}</span>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  )
}

/**
 * 浏览器预览环境下的整页占位。
 * 本应用的数据来自本机日志，只有桌面版（Electron）有文件访问权限。
 */
export function DesktopOnlyPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="page">
      <PageHeader kicker="桌面版功能" title={title} />
      <EmptyState
        icon={<MonitorSmartphone size={ICON_SIZE.lg} />}
        title="需要桌面版"
        description={description}
      />
    </div>
  )
}
