import { Check, CircleDashed, Eye, TriangleAlert } from 'lucide-react'
import { classNames, confidenceClass, confidenceLabels } from '../lib/utils'
import { tools } from '../data/mockData'
import type { Confidence, ToolId } from '../types'

interface ConfidenceBadgeProps {
  confidence: Confidence
  compact?: boolean
}

export function ConfidenceBadge({ confidence, compact }: ConfidenceBadgeProps) {
  const icons = {
    confirmed: Check,
    likely: Eye,
    inferred: CircleDashed,
    duration: TriangleAlert,
  }
  const Icon = icons[confidence]

  return (
    <span
      className={classNames(
        'confidence-badge',
        confidenceClass[confidence],
        compact && 'confidence-badge-compact',
      )}
    >
      <Icon size={compact ? 11 : 12} />
      {confidenceLabels[confidence]}
    </span>
  )
}

interface ToolBadgeProps {
  toolId: ToolId
  showName?: boolean
  compact?: boolean
}

export function ToolBadge({ toolId, showName = false, compact = false }: ToolBadgeProps) {
  const tool = tools.find((item) => item.id === toolId)
  if (!tool) return null

  return (
    <span
      className={classNames('tool-badge', compact && 'tool-badge-compact')}
      title={tool.name}
      style={{ '--tool-color': tool.color } as React.CSSProperties}
    >
      <span className="tool-dot" />
      {showName && <span>{tool.name}</span>}
    </span>
  )
}

interface ToolStackProps {
  toolIds: ToolId[]
  max?: number
}

export function ToolStack({ toolIds, max = 4 }: ToolStackProps) {
  return (
    <span className="tool-stack" aria-label="参与工具">
      {toolIds.slice(0, max).map((toolId) => (
        <ToolBadge key={toolId} toolId={toolId} compact />
      ))}
      {toolIds.length > max && <span className="tool-overflow">+{toolIds.length - max}</span>}
    </span>
  )
}

export function StatusDot({ status }: { status: string }) {
  return <span className={classNames('status-dot', `status-${status}`)} />
}

export function StackedProgress({ value }: { value: number }) {
  return (
    <span className="stacked-progress" aria-label={`进度 ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  )
}
