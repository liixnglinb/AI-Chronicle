import { useMemo, useState } from 'react'
import { Cpu, Flame, FolderKanban, FolderOpen, Timer } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatDayLabelShort,
  formatDuration,
  sessionDurationMinutes,
  shortenPath,
} from '../lib/format'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import { SummaryStrip } from '../components/SummaryStrip'
import { ChartTooltip } from '../components/ChartTooltip'
import { classNames } from '../lib/utils'
import type { SessionRecord, ToastMessage } from '../types'
import { ICON_SIZE } from '../lib/ui'

interface InsightsPageProps {
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type InsightRange = 7 | 14 | 30

const RANGE_OPTIONS: InsightRange[] = [7, 14, 30]

interface MetricGroup {
  key: string
  name: string
  color?: string
  path?: string
  sessions: number
  turns: number
  artifacts: number
  minutes: number
  lastActive: number
}

export function InsightsPage({ onToast }: InsightsPageProps) {
  const { data, loading, isDesktop } = useChronicle()
  const [range, setRange] = useState<InsightRange>(14)

  const sessions = useMemo(() => {
    const minTime = Date.now() - range * 86_400_000
    return (data?.sessions ?? [])
      .filter((session) => (session.start || 0) >= minTime)
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data, range])

  const totals = useMemo(() => {
    const days = new Set<string>()
    let turns = 0
    let artifacts = 0
    let minutes = 0
    for (const session of sessions) {
      if (session.start) days.add(dayKeyOf(session.start))
      turns += session.turns
      artifacts += (session.artifacts ?? []).length
      minutes += sessionDurationMinutes(session)
    }
    return { days: days.size, turns, artifacts, minutes }
  }, [sessions])

  const groups = useMemo(() => {
    function groupBy(getKey: (session: SessionRecord) => string): MetricGroup[] {
      const map = new Map<string, MetricGroup>()
      for (const session of sessions) {
        const key = getKey(session)
        const item = map.get(key) || {
          key,
          name: key,
          color: session.toolColor,
          path: session.projectPath,
          sessions: 0,
          turns: 0,
          artifacts: 0,
          minutes: 0,
          lastActive: 0,
        }
        item.sessions += 1
        item.turns += session.turns
        item.artifacts += (session.artifacts ?? []).length
        item.minutes += sessionDurationMinutes(session)
        item.lastActive = Math.max(item.lastActive, session.end || session.start || 0)
        map.set(key, item)
      }
      return [...map.values()].sort((a, b) => b.turns - a.turns || b.artifacts - a.artifacts)
    }

    return {
      tools: groupBy((session) => session.tool),
      projects: groupBy((session) => session.projectPath || session.project || '(未知位置)'),
    }
  }, [sessions])

  // 项目分组名默认是完整路径，列表里改为末两段，避免出现超长绝对路径
  const projectLabel = (name: string) => (name === '(未知位置)' ? name : shortenPath(name))

  const daily = useMemo(() => {
    const map = new Map<string, { sessions: number; turns: number; artifacts: number }>()
    for (const session of sessions) {
      if (!session.start) continue
      const key = dayKeyOf(session.start)
      const item = map.get(key) || { sessions: 0, turns: 0, artifacts: 0 }
      item.sessions += 1
      item.turns += session.turns
      item.artifacts += (session.artifacts ?? []).length
      map.set(key, item)
    }

    const output: {
      day: string
      label: string
      sessions: number
      turns: number
      artifacts: number
    }[] = []
    for (let index = range - 1; index >= 0; index--) {
      const day = dayKeyOf(Date.now() - index * 86_400_000)
      const value = map.get(day)
      const date = new Date(day.replace(/-/g, '/'))
      output.push({
        day,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        sessions: value?.sessions ?? 0,
        turns: value?.turns ?? 0,
        artifacts: value?.artifacts ?? 0,
      })
    }
    return output
  }, [sessions, range])

  const busiestDay = [...daily].sort((a, b) => b.turns - a.turns)[0]
  const topProject = groups.projects[0]
  const topTool = groups.tools[0]

  async function openFolder(path?: string) {
    if (!path || path === '(未知位置)') return
    const result = await window.desktopAPI?.openPath(path)
    if (result && !result.ok) {
      onToast({
        tone: 'warning',
        title: '无法打开项目目录',
        message: result.message ?? '目录可能已被移动或删除。',
      })
    }
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="分析"
        description="分析基于本机真实会话日志计算，浏览器预览无法读取。"
      />
    )
  }

  return (
    <div className="page">
      <PageHeader
        kicker={
          sessions.length
            ? `近 ${range} 天 · ${totals.days} 个活跃日 · ${totals.turns} 轮 · ${totals.artifacts} 个产出`
            : '选择周期查看真实工作投入'
        }
        title="分析"
        actions={
          <div className="segmented-control" aria-label="分析周期">
            {RANGE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={classNames(range === value && 'segmented-active')}
                onClick={() => setRange(value)}
              >
                {value} 天
              </button>
            ))}
          </div>
        }
      />

      {loading && !data && <SkeletonPage cells={4} rows={3} />}

      {data && sessions.length === 0 && (
        <EmptyState title="所选周期没有会话" description="切换到 30 天，或产生新会话后重新采集。" />
      )}

      {sessions.length > 0 && (
        <>
          <SummaryStrip
            items={[
              {
                key: 'tool',
                label: '主力软件',
                value: topTool?.name ?? '—',
                hint: topTool ? `${topTool.sessions} 会话 · ${topTool.turns} 轮` : undefined,
                icon: <Cpu size={ICON_SIZE.sm} />,
                tone: 'primary',
              },
              {
                key: 'project',
                label: '重点投入',
                value: topProject?.name ?? '—',
                hint: topProject
                  ? `${topProject.turns} 轮 · ${topProject.artifacts} 个产出`
                  : undefined,
                icon: <FolderKanban size={ICON_SIZE.sm} />,
                tone: 'info',
              },
              {
                key: 'busiest',
                label: '最忙一天',
                value:
                  busiestDay && busiestDay.turns > 0 ? formatDayLabelShort(busiestDay.day) : '—',
                hint: busiestDay && busiestDay.turns > 0 ? `${busiestDay.turns} 轮对话` : undefined,
                icon: <Flame size={ICON_SIZE.sm} />,
                tone: 'warning',
                compact: true,
              },
              {
                key: 'span',
                label: '累计工作时长',
                value: formatDuration(totals.minutes) || '—',
                hint: `${totals.days} 个活跃日`,
                icon: <Timer size={ICON_SIZE.sm} />,
                tone: 'positive',
                compact: true,
              },
            ]}
          />

          <div className="insights-grid-real">
            <section className="chart-panel chart-panel-wide">
              <div className="section-title-row">
                <span className="eyebrow">每日节奏</span>
                <span className="result-count">柱高 = 当日会话数 · 悬停查看轮次与产出</span>
              </div>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border-subtle)"
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
                      content={
                        <ChartTooltip
                          rows={(point) => [
                            { label: '会话', value: Number(point?.sessions ?? 0) },
                            { label: '轮次', value: Number(point?.turns ?? 0) },
                            { label: '产出', value: Number(point?.artifacts ?? 0) },
                          ]}
                        />
                      }
                    />
                    <Bar
                      dataKey="sessions"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={26}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="chart-panel">
              <div className="section-title-row">
                <span className="eyebrow">软件投入</span>
                <span className="result-count">按轮次占比排序</span>
              </div>
              <div className="contribution-list">
                {groups.tools.map((tool) => {
                  const percent = totals.turns ? Math.round((tool.turns / totals.turns) * 100) : 0
                  return (
                    <div className="contribution-row" key={tool.key}>
                      <div className="contribution-name">
                        <span
                          className="tool-dot"
                          style={{ ['--tool-color' as string]: tool.color ?? 'var(--primary)' }}
                        />
                        <span title={tool.name}>{tool.name}</span>
                      </div>
                      <div className="contribution-value">
                        <span>
                          {tool.sessions} 会话 · {tool.turns} 轮
                        </span>
                        <strong>{percent}%</strong>
                      </div>
                      <div className="contribution-track">
                        <span
                          style={{
                            width: `${Math.max(2, percent)}%`,
                            background: tool.color ?? 'var(--primary)',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="chart-panel">
              <div className="section-title-row">
                <span className="eyebrow">重点项目</span>
                <span className="result-count">可打开目录继续工作</span>
              </div>
              <div className="collection-list">
                {groups.projects.slice(0, 12).map((project, index) => (
                  <div className="collection-row" key={project.key}>
                    <span className="collection-index">{index + 1}</span>
                    <div className="collection-copy">
                      <strong title={project.name}>{projectLabel(project.name)}</strong>
                      <small>
                        {project.sessions} 会话 · {project.turns} 轮 · {project.artifacts} 产出 ·{' '}
                        {formatDuration(project.minutes) || '跨度不足 1 分钟'}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => void openFolder(project.path)}
                      title="打开项目目录"
                      aria-label={`打开项目目录：${project.name}`}
                    >
                      <FolderOpen size={ICON_SIZE.sm} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
