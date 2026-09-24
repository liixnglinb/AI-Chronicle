import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import {
  artifacts,
  activityBlocks,
  summaryMetrics,
  taskItems,
  tools,
  workstreams,
} from '../data/mockData'
import { classNames, formatTimeFromMinute } from '../lib/utils'
import { openLocalPath, saveText } from '../lib/desktop'
import type { TaskStatus, ToastMessage, ViewId, Workstream } from '../types'
import { EvidencePanel } from '../components/EvidencePanel'
import { ActivityTimeline } from '../components/Timeline'
import { ConfidenceBadge, ToolStack } from '../components/StatusBadges'
import { TaskLedger } from '../components/TaskLedger'

interface TodayPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
  onOpenEvidence: (workstream: Workstream | undefined) => void
  onNavigate: (view: ViewId) => void
  selectedWorkstream?: Workstream
}

export function TodayPage({
  searchQuery,
  onToast,
  onOpenEvidence,
  onNavigate,
  selectedWorkstream,
}: TodayPageProps) {
  const [range, setRange] = useState<[number, number]>([450, 900])
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(
    () => window.localStorage.getItem('ai-chronicle-today-note') ?? '',
  )
  const [tasks, setTasks] = useState(() =>
    taskItems.filter((task) => task.date === '2026-09-24'),
  )
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredWorkstreams = useMemo(
    () =>
      workstreams.filter((workstream) => {
        if (!normalizedQuery) return true
        return [workstream.title, workstream.project, workstream.summary]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      }),
    [normalizedQuery],
  )

  const filteredArtifacts = useMemo(
    () =>
      artifacts.filter((artifact) => {
        if (!normalizedQuery) return true
        return [artifact.name, artifact.project]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      }),
    [normalizedQuery],
  )

  const topTools = tools.filter((tool) => tool.usageMinutes >= 20).slice(0, 6)
  const completedTasks = tasks.filter((task) => task.status === 'completed').length
  const completedPercent = Math.round((completedTasks / tasks.length) * 100)

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    )
  }

  async function exportDailyReport() {
    const content = [
      '# AI 工作日报 · 2026-09-24',
      '',
      '## 今日概览',
      '- AI 活跃时长：7 小时 14 分',
      '- 完成任务：3 / 7',
      '- 有效会话：20',
      '- 产出：8',
      '',
      '## 今日任务',
      ...tasks.map(
        (task) =>
          `- [${task.status === 'completed' ? 'x' : ' '}] ${task.title} · ${task.project} · ${task.progress}%`,
      ),
      '',
      '## 今日说明',
      '设计、日志适配和项目规划同时推进，历史档案与任务系统已经进入统一视图。',
      '',
      note ? `## 本地备注\n${note}` : '',
    ].join('\n')
    const result = await saveText('AI工作日报-2026-09-24.md', content)
    onToast({
      tone: 'success',
      title: '日报已导出',
      message: result.message ?? 'Markdown 日报已经保存。',
    })
  }

  return (
    <div className="page today-page">
      <section className="page-intro today-intro">
        <div className="intro-copy">
          <span className="eyebrow">
            <Sparkles size={14} />
            今日 AI 日志已生成
          </span>
          <h1>
            今天，你把 <span>7 小时 14 分</span> 变成了 4 条工作线程。
          </h1>
          <p>
            设计、日志适配和项目规划同时推进。Codex、Qoder 与 CatPaw
            构成了今天最完整的证据链，另有两条记录需要人工确认。
          </p>
        </div>
        <div className="intro-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={async () => {
              onToast({
                tone: 'info',
                title: '正在重新生成日报',
                message: '已启动增量扫描，完成后会自动刷新概览。',
              })
              if (window.desktopAPI) {
                await window.desktopAPI.scanSources()
              } else {
                await new Promise((resolve) => window.setTimeout(resolve, 700))
              }
              window.setTimeout(
                () =>
                  onToast({
                    tone: 'success',
                    title: '日报已更新',
                    message: '新增 6 条事件，任务和产出关联已重新计算。',
                  }),
                1200,
              )
            }}
          >
            <RefreshCw size={15} />
            重新生成
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={exportDailyReport}
          >
            <Download size={15} />
            导出日报
          </button>
          <span className="generated-at">最后更新 13:28 · 数据覆盖 96%</span>
        </div>
      </section>

      <section className="metric-strip" aria-label="今日指标">
        {summaryMetrics.map((metric) => {
          const Icon = metric.icon
          return (
            <article className={classNames('metric-item', `metric-${metric.tone}`)} key={metric.label}>
              <span className="metric-icon">
                <Icon size={17} />
              </span>
              <span className="metric-copy">
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <span>{metric.detail}</span>
              </span>
            </article>
          )
        })}
      </section>

      <section className="surface today-task-board">
        <header className="surface-header">
          <div>
            <span className="section-kicker">今日任务</span>
            <h2>今天正在进行的工作</h2>
          </div>
          <div className="today-task-progress">
            <span>
              <strong>{completedTasks}</strong>
              <small>/ {tasks.length} 已完成</small>
            </span>
            <div>
              <span style={{ width: `${completedPercent}%` }} />
            </div>
          </div>
        </header>
        <TaskLedger
          tasks={tasks}
          onStatusChange={changeTaskStatus}
          onTaskAction={(title, message) =>
            onToast({ tone: 'success', title, message })
          }
        />
      </section>

      <div className="today-layout">
        <div className="today-main">
          <section className="surface timeline-surface">
            <header className="surface-header">
              <div>
                <span className="section-kicker">活动脉冲</span>
                <h2>今天的时间线</h2>
              </div>
              <div className="tool-filter-row">
                {topTools.map((tool) => (
                  <span className="filter-stat" key={tool.id}>
                    <span style={{ background: tool.color }} />
                    {tool.name}
                    <small>{tool.usageMinutes}m</small>
                  </span>
                ))}
              </div>
            </header>
            <ActivityTimeline
              blocks={activityBlocks}
              startMinute={range[0]}
              endMinute={range[1]}
              compact
              onZoom={(direction) =>
                setRange(([start, end]) => {
                  const padding = direction === 'in' ? -90 : 90
                  return [
                    Math.max(0, start - padding),
                    Math.min(1440, end + padding),
                  ]
                })
              }
            />
          </section>

          <section className="surface workstream-surface">
            <header className="surface-header">
              <div>
                <span className="section-kicker">AI 摘要</span>
                <h2>今天完成的四条工作线程</h2>
              </div>
              <span className="header-note">点击查看证据链</span>
            </header>
            <div className="workstream-list">
              {filteredWorkstreams.map((workstream) => (
                <button
                  key={workstream.id}
                  className={classNames(
                    'workstream-row',
                    selectedWorkstream?.id === workstream.id && 'workstream-row-selected',
                  )}
                  type="button"
                  onClick={() => onOpenEvidence(workstream)}
                >
                  <span className="workstream-time">
                    <strong>{formatTimeFromMinute(workstream.startMinute)}</strong>
                    <span />
                    <small>{formatTimeFromMinute(workstream.endMinute)}</small>
                  </span>
                  <span className="workstream-content">
                    <span className="workstream-topline">
                      <strong>{workstream.title}</strong>
                      <ConfidenceBadge confidence={workstream.confidence} compact />
                    </span>
                    <span className="workstream-summary">{workstream.summary}</span>
                    <span className="workstream-meta">
                      <span>{workstream.project}</span>
                      <span>{workstream.durationMinutes} 分钟</span>
                      <ToolStack toolIds={workstream.toolIds} />
                    </span>
                  </span>
                  <span className="workstream-result">
                    <small>完成结果</small>
                    <span>
                      <CheckCircle2 size={14} />
                      {workstream.achievement}
                    </span>
                  </span>
                  <ChevronRight className="row-chevron" size={17} />
                </button>
              ))}
            </div>
          </section>

          <section className="surface artifacts-surface">
            <header className="surface-header">
              <div>
                <span className="section-kicker">今日产物</span>
                <h2>AI 参与生成或修改的成果</h2>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => onNavigate('library')}
              >
                查看全部
                <ArrowUpRight size={15} />
              </button>
            </header>
            <div className="artifact-strip">
              {filteredArtifacts.slice(0, 4).map((artifact) => {
                const Icon = artifact.icon
                return (
                  <button
                    className="artifact-tile"
                    type="button"
                    key={artifact.id}
                    onClick={async () => {
                      const result = await openLocalPath(artifact.path)
                      onToast({
                        tone: result.ok ? 'success' : 'warning',
                        title: result.ok ? `已定位 ${artifact.name}` : '无法打开成果',
                        message:
                          result.message ??
                          '桌面版会在系统资源管理器中打开关联文件。',
                      })
                    }}
                  >
                    <span
                      className={classNames('artifact-preview', `artifact-preview-${artifact.type}`)}
                    >
                      <Icon size={24} />
                      <small>{artifact.type.toUpperCase()}</small>
                    </span>
                    <span className="artifact-tile-copy">
                      <strong>{artifact.name}</strong>
                      <span>{artifact.project}</span>
                      <small>
                        {artifact.modifiedAt} · {artifact.size}
                      </small>
                    </span>
                    <ToolStack toolIds={artifact.toolIds} max={3} />
                  </button>
                )
              })}
            </div>
          </section>

          <section className="reflection-bar">
            <span className="reflection-icon">
              <Clock3 size={18} />
            </span>
            <span>
              <strong>明天可以从这里继续</strong>
              <small>前端首页已完成结构设计，下一步是联调真实适配器与增量数据。</small>
            </span>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setNoteOpen(true)}
            >
              <FileText size={14} />
              写备注
            </button>
          </section>
        </div>

        <EvidencePanel
          workstream={selectedWorkstream}
          onClose={() => onOpenEvidence(undefined)}
          onNotify={(title, message) => onToast({ tone: 'info', title, message })}
        />
      </div>

      {noteOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={() => setNoteOpen(false)}
        >
          <section
            className="modal-card note-modal"
            role="dialog"
            aria-modal="true"
            aria-label="编辑今日备注"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="section-kicker">本地备注</span>
                <h2>补充今天的工作说明</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setNoteOpen(false)}
                title="关闭"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </header>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录日报无法从日志中推断的背景、决策或明天要延续的事项。"
              autoFocus
            />
            <footer>
              <span>内容仅保存在本机</span>
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  window.localStorage.setItem('ai-chronicle-today-note', note)
                  setNoteOpen(false)
                  onToast({
                    tone: 'success',
                    title: '备注已保存',
                    message: '这段说明会包含在导出日报中。',
                  })
                }}
              >
                保存备注
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
