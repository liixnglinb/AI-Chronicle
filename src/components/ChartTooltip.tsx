import type { ReactNode } from 'react'

interface ChartTooltipRow {
  label: string
  value: ReactNode
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: Record<string, unknown> }>
  label?: string | number
  /** 由调用方决定展示哪些字段，保证提示内容与图表语义一致 */
  rows?: (point: Record<string, unknown> | undefined) => ChartTooltipRow[]
}

/**
 * Recharts 提示框主题化实现。
 * 默认 Tooltip 使用固定白底样式，在深色主题下会弹出突兀的白盒；
 * 这里改为跟随设计令牌的浮层，并统一字号与内边距。
 */
export function ChartTooltip({ active, payload, label, rows }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  const items = rows ? rows(point) : []

  return (
    <div className="chart-tooltip">
      {label !== undefined ? <strong>{label}</strong> : null}
      {items.map((row) => (
        <div className="chart-tooltip-row" key={row.label}>
          <i />
          <span>{row.label}</span>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  )
}
