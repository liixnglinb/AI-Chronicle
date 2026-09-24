import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Filter, Radio, Sparkles } from 'lucide-react'
import { activityBlocks, tools } from '../data/mockData'
import type { ActivityBlock, ToastMessage } from '../types'
import { ActivityTimeline } from '../components/Timeline'
import { EvidencePanel } from '../components/EvidencePanel'
import { ToolBadge } from '../components/StatusBadges'
import { classNames, formatTimeFromMinute } from '../lib/utils'

interface TimelinePageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

const zoomRanges: Array<[number, number]> = [
  [0, 1440],
  [360, 1080],
  [450, 900],
  [510, 870],
]

export function TimelinePage({ searchQuery, onToast }: TimelinePageProps) {
  const [selectedBlock, setSelectedBlock] = useState<ActivityBlock>(activityBlocks[7])
  const [activeTool, setActiveTool] = useState('all')
  const [zoomIndex, setZoomIndex] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [playMinute, setPlayMinute] = useState(420)
  const [range, setRange] = useState<[number, number]>(zoomRanges[1])

  useEffect(() => {
    if (!playing) return
    const interval = window.setInterval(() => {
      setPlayMinute((minute) => {
        if (minute >= range[1]) {
          setPlaying(false)
          return range[1]
        }
        return minute + 6
      })
    }, 160)
    return () => window.clearInterval(interval)
  }, [playing, range])

  const filteredBlocks = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    return activityBlocks.filter((block) => {
      const toolMatches = activeTool === 'all' || block.toolId === activeTool
      const textMatches =
        !normalized ||
        [block.title, block.detail, block.project].join(' ').toLowerCase().includes(normalized)
      return toolMatches && textMatches
    })
  }, [activeTool, searchQuery])

  function changeZoom(index: number) {
    const safeIndex = Math.max(0, Math.min(zoomRanges.length - 1, index))
    setZoomIndex(safeIndex)
    setRange(zoomRanges[safeIndex])
  }

  return (
    <div className="page timeline-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <CalendarRange size={14} />
            24 小时活动记录
          </span>
          <h1>全天时间线</h1>
          <p>按软件轨道查看今天每一次 AI 活跃区间，并回放工作节奏。</p>
        </div>
        <div className="heading-actions">
          <span className="live-pill">
            <Radio size={13} />
            本机采集正常
          </span>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              window.localStorage.setItem(
                'ai-chronicle-timeline-view',
                JSON.stringify({ activeTool, zoomIndex }),
              )
              onToast({
                tone: 'success',
                title: '筛选已保存',
                message: '时间线视图会记住当前软件与项目筛选。',
              })
            }}
          >
            <Filter size={14} />
            保存视图
          </button>
        </div>
      </section>

      <section className="timeline-filterbar">
        <button
          className={classNames('filter-chip', activeTool === 'all' && 'filter-chip-active')}
          type="button"
          onClick={() => setActiveTool('all')}
        >
          全部软件
          <span>{activityBlocks.length}</span>
        </button>
        {tools.slice(0, 8).map((tool) => (
          <button
            key={tool.id}
            className={classNames('filter-chip', activeTool === tool.id && 'filter-chip-active')}
            type="button"
            onClick={() => setActiveTool(tool.id)}
          >
            <ToolBadge toolId={tool.id} compact />
            {tool.name}
          </button>
        ))}
      </section>

      <div className="timeline-workspace">
        <section className="surface full-timeline-surface">
          <header className="surface-header timeline-workspace-header">
            <div>
              <span className="section-kicker">时间画布</span>
              <h2>{formatTimeFromMinute(range[0])} 至 {formatTimeFromMinute(range[1])}</h2>
            </div>
            <span className="header-note">{filteredBlocks.length} 个活动区间</span>
          </header>
          <div className="playback-track">
            <span className="playback-label">
              <Sparkles size={13} />
              回放进度 {formatTimeFromMinute(playMinute)}
            </span>
            <div>
              <span
                className="playback-progress"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, ((playMinute - range[0]) / (range[1] - range[0])) * 100),
                  )}%`,
                }}
              />
              <span
                className="playback-cursor"
                style={{
                  left: `${Math.max(
                    0,
                    Math.min(100, ((playMinute - range[0]) / (range[1] - range[0])) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
          <ActivityTimeline
            blocks={filteredBlocks}
            selectedId={selectedBlock.id}
            startMinute={range[0]}
            endMinute={range[1]}
            showControls
            playing={playing}
            onSelect={setSelectedBlock}
            onPlayToggle={() => {
              if (!playing && playMinute >= range[1]) setPlayMinute(range[0])
              setPlaying((value) => !value)
            }}
            onZoom={(direction) => changeZoom(zoomIndex + (direction === 'in' ? 1 : -1))}
          />
          <div className="timeline-caption">
            <span><i className="caption-pulse" /> 已确认会话</span>
            <span>条块宽度代表持续时间</span>
            <span>点击任意活动查看证据</span>
          </div>
        </section>

        <EvidencePanel
          block={selectedBlock}
          onNotify={(title, message) => onToast({ tone: 'info', title, message })}
        />
      </div>
    </div>
  )
}
