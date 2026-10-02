import type { ReactNode } from 'react'
import { classNames } from '../lib/utils'

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  title?: string
}

/**
 * 徽标：计数与状态标签统一形态。
 * 取代此前散落的 nav-count / source-count / tool-summary-chip 等各自实现。
 */
export function Badge({ children, tone = 'neutral', className, title }: BadgeProps) {
  return (
    <span className={classNames('badge', `badge-${tone}`, className)} title={title}>
      {children}
    </span>
  )
}
