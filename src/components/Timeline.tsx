import { Play, Pause, ZoomIn, ZoomOut } from 'lucide-react'
import { tools } from '../data/mockData'
import { classNames, formatTimeFromMinute } from '../lib/utils'
import type { ActivityBlock } from '../types'
import { ToolBadge } from './StatusBadges'

interface TimelineProps {
  blocks: ActivityBlock[]
  selectedId?: string
  startMinute?: number
  endMinute?: number
  compact?: boolean
  showControls?: boolean
  playing?: boolean
  onSelect?: (block: ActivityBlock) => void
  onPlayToggle?: () => void
  onZoom?: (direction: 'in' | 'out') => void
}

const axisHours = [0, 3, 6, 9, 12, 15, 18, 21, 24]

export function ActivityTimeline({
  blocks,
  selectedId,
  startMinute = 0,
  endMinute = 1440,
  compact = false,
  showControls = false,
  playing = false,
  onSelect,
  onPlayToggle,
  onZoom,
}: TimelineProps) {
  const range = endMinute - startMinute
  const visibleTools = tools.filter((tool) =>
    blocks.some((block) => block.toolId === tool.id),
  )

  return (
    <div className={classNames('timeline-shell', compact && 'timeline-shell-compact')}>
      {showControls && (
        <div className="timeline-controls">
          <div className="timeline-zoom">
            <button
              className="icon-button"
              type="button"
              title="缩小时间轴"
              aria-label="缩小时间轴"
              onClick={() => onZoom?.('out')}
            >
              <ZoomOut size={15} />
            </button>
            <button
              className="icon-button"
              type="button"
              title="放大时间轴"
              aria-label="放大时间轴"
              onClick={() => onZoom?.('in')}
            >
              <ZoomIn size={15} />
            </button>
          </div>
          <button className="button button-secondary" type="button" onClick={onPlayToggle}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? '暂停回放' : '回放今天'}
          </button>
        </div>
      )}

      <div className="timeline-axis timeline-axis-top">
        {axisHours.map((hour) => {
          const position = ((hour * 60 - startMinute) / range) * 100
          if (position < 0 || position > 100) return null
          return (
            <span key={hour} style={{ left: `${position}%` }}>
              {String(hour).padStart(2, '0')}:00
            </span>
          )
        })}
      </div>

      <div className="timeline-body">
        <div className="timeline-grid" aria-hidden="true">
          {axisHours.map((hour) => {
            const position = ((hour * 60 - startMinute) / range) * 100
            if (position < 0 || position > 100) return null
            return <span key={hour} style={{ left: `${position}%` }} />
          })}
        </div>

        {visibleTools.map((tool) => {
          const toolBlocks = blocks.filter((block) => block.toolId === tool.id)
          return (
            <div className="timeline-row" key={tool.id}>
              <div className="timeline-label">
                <ToolBadge toolId={tool.id} />
                <span>{tool.name}</span>
              </div>
              <div className="timeline-lane">
                {toolBlocks.map((block) => {
                  const blockStart = Math.max(block.startMinute, startMinute)
                  const blockEnd = Math.min(block.endMinute, endMinute)
                  const left = ((blockStart - startMinute) / range) * 100
                  const width = Math.max(((blockEnd - blockStart) / range) * 100, 0.7)
                  return (
                    <button
                      key={block.id}
                      className={classNames(
                        'timeline-block',
                        selectedId === block.id && 'timeline-block-selected',
                      )}
                      type="button"
                      onClick={() => onSelect?.(block)}
                      title={`${formatTimeFromMinute(block.startMinute)} - ${formatTimeFromMinute(block.endMinute)} ${block.title}`}
                      style={
                        {
                          left: `${left}%`,
                          width: `${width}%`,
                          '--block-color': tool.color,
                        } as React.CSSProperties
                      }
                    >
                      <span>{block.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="timeline-axis timeline-axis-bottom">
        <span>{formatTimeFromMinute(startMinute)}</span>
        <span>{formatTimeFromMinute(endMinute)}</span>
      </div>
    </div>
  )
}
