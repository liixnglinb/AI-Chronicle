export interface ToolRatio {
  name: string
  count: number
  color: string
  pct: number
}

interface ToolSplitTrackProps {
  ratios: ToolRatio[]
}

/** 工具占比比例带：一行看清各 AI Agent 的会话贡献分布 */
export function ToolSplitTrack({ ratios }: ToolSplitTrackProps) {
  if (ratios.length === 0) return null
  return (
    <div className="desk-track-container">
      <div className="desk-track-line">
        {ratios.map((t) => (
          <div
            key={t.name}
            className="desk-track-seg"
            style={{ width: `${Math.max(t.pct, 0.6)}%`, backgroundColor: t.color }}
            title={`${t.name}: ${t.count} 场会话（${t.pct}%）`}
          />
        ))}
      </div>
      <div className="desk-track-legend">
        {ratios.map((t) => (
          <div key={t.name} className="desk-legend-item">
            <span className="desk-legend-dot" style={{ backgroundColor: t.color }} />
            <span className="desk-legend-name">{t.name}</span>
            <span className="desk-legend-val">
              {t.count} · {t.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
