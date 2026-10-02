import type { ReactNode } from 'react'
import { classNames } from '../lib/utils'

export type SummaryTone = 'default' | 'primary' | 'positive' | 'info' | 'warning'

export interface SummaryItem {
  key: string
  label: ReactNode
  value: ReactNode
  /** 数值下方的补充说明，例如占比或口径 */
  hint?: ReactNode
  icon?: ReactNode
  tone?: SummaryTone
  /** 数值较长时（如时间区间）使用较小的字号，避免溢出 */
  compact?: boolean
}

/**
 * 统一指标条：KPI、汇总、健康度共用同一形态与栅格，
 * 取代此前 kpi-strip / history-summary-strip / project-summary-strip /
 * insight-summary / source-health-strip 五套彼此不一致的实现。
 */
export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <div className="summary-strip">
      {items.map((item) => (
        <article
          className={classNames(
            'summary-cell',
            item.tone && item.tone !== 'default' && `summary-cell-${item.tone}`,
            item.compact && 'summary-cell-compact',
          )}
          key={item.key}
        >
          {item.icon ? <span className="summary-icon">{item.icon}</span> : null}
          <div className="summary-copy">
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            {item.hint ? <span>{item.hint}</span> : null}
          </div>
        </article>
      ))}
    </div>
  )
}
