import { useLayoutEffect, useRef, useState } from 'react'

export interface DailyPoint {
  /** MM-DD */
  day: string
  hours: number
  minutes: number
}

interface TrendBarChartProps {
  data: DailyPoint[]
  height?: number
}

/**
 * 活跃投入柱状图：内联 SVG 自绘，零打包开销。
 * 颜色全部取自 --vr-chart-* 令牌，深浅色切换时与主题严格同源，
 * 不会像外部图表库那样弹出固定白底的浮层。
 */
export function TrendBarChart({ data, height = 200 }: TrendBarChartProps) {
  // viewBox 宽度跟随容器实测宽度：此前固定 720 + preserveAspectRatio="none"，
  // 容器一宽整张 SVG 被横向拉伸，轴刻度文字实测变形 1.74 倍（5.5px → 9.5px）
  const wrapRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(720)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const update = () => setChartWidth(Math.max(320, Math.round(el.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const chartHeight = height
  const maxHours = Math.max(...data.map((d) => d.hours), 1)
  const plotBottom = chartHeight - 32
  const plotTop = 18
  const availableHeight = plotBottom - plotTop
  const colWidth = data.length ? (chartWidth - 56) / data.length : chartWidth - 56

  return (
    <div ref={wrapRef} className="desk-svg-wrap" style={{ height }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="desk-native-chart"
        preserveAspectRatio="none"
        role="img"
        aria-label="每日会话时长合计趋势"
      >
        {/* 网格基线：三条足够读数，不做多余刻度 */}
        <line
          x1="26"
          y1={plotTop}
          x2={chartWidth - 16}
          y2={plotTop}
          stroke="var(--vr-chart-grid)"
          strokeDasharray="3 3"
        />
        <line
          x1="26"
          y1={plotTop + availableHeight / 2}
          x2={chartWidth - 16}
          y2={plotTop + availableHeight / 2}
          stroke="var(--vr-chart-grid)"
          strokeDasharray="3 3"
        />
        <line
          x1="26"
          y1={plotBottom}
          x2={chartWidth - 16}
          y2={plotBottom}
          stroke="var(--vr-chart-grid)"
        />

        {/* 左轴刻度：0 / 峰值一半 / 峰值 */}
        <text x="22" y={plotBottom + 4} textAnchor="end" className="desk-svg-axis-text">
          0
        </text>
        <text
          x="22"
          y={plotTop + availableHeight / 2 + 4}
          textAnchor="end"
          className="desk-svg-axis-text"
        >
          {(maxHours / 2).toFixed(1)}
        </text>
        <text x="22" y={plotTop + 4} textAnchor="end" className="desk-svg-axis-text">
          {maxHours.toFixed(1)}
        </text>

        {data.map((pt, idx) => {
          const x = 30 + idx * colWidth
          const barHeight = (pt.hours / maxHours) * availableHeight
          const y = plotBottom - barHeight
          // 30 天视图下 24 根柱会挤成一条线，保底 3px 保证仍可点击
          const barW = Math.max(colWidth - 5, 3)
          // X 轴标签抽稀：按可用宽度决定每隔几根显示一次
          const labelStep = Math.max(1, Math.ceil(data.length / 14))

          return (
            <g key={pt.day}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barHeight, 2)}
                rx="2"
                fill="var(--vr-chart-bar)"
                className="desk-svg-bar"
              >
                <title>{`${pt.day}：${pt.hours} 小时（${pt.minutes} 分钟）`}</title>
              </rect>
              {idx % labelStep === 0 && (
                <text
                  x={x + barW / 2}
                  y={plotBottom + 16}
                  textAnchor="middle"
                  className="desk-svg-axis-text"
                >
                  {pt.day}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
