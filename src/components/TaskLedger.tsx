import { useState } from 'react'
import {
  CalendarDays,
  Check,
  Circle,
  CircleDashed,
  Clock3,
  MoreHorizontal,
  PauseCircle,
} from 'lucide-react'
import type { TaskItem, TaskStatus } from '../types'
import { classNames } from '../lib/utils'
import { ToolStack } from './StatusBadges'

interface TaskLedgerProps {
  tasks: TaskItem[]
  compact?: boolean
  showDate?: boolean
  onStatusChange?: (taskId: string, status: TaskStatus) => void
  onTaskAction?: (title: string, message: string) => void
}

const statusMeta = {
  completed: { label: '已完成', icon: Check },
  doing: { label: '进行中', icon: CircleDashed },
  planned: { label: '待开始', icon: Circle },
  blocked: { label: '受阻', icon: PauseCircle },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <span className={classNames('task-status-badge', `task-status-${status}`)}>
      <Icon size={11} />
      {meta.label}
    </span>
  )
}

export function TaskLedger({
  tasks,
  compact = false,
  showDate = false,
  onStatusChange,
  onTaskAction,
}: TaskLedgerProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  if (!tasks.length) {
    return (
      <div className="task-ledger-empty">
        <Check size={20} />
        <span>这一天还没有记录任务</span>
      </div>
    )
  }

  return (
    <div className={classNames('task-ledger', compact && 'task-ledger-compact')}>
      {tasks.map((task) => {
        const Icon = statusMeta[task.status].icon
        return (
          <article className="task-row" key={task.id}>
            <button
              className={classNames('task-check', `task-check-${task.status}`)}
              type="button"
              title={
                task.status === 'completed'
                  ? '标记为进行中'
                  : '标记为已完成'
              }
              aria-label={
                task.status === 'completed'
                  ? `将 ${task.title} 标记为进行中`
                  : `将 ${task.title} 标记为已完成`
              }
              onClick={() =>
                onStatusChange?.(
                  task.id,
                  task.status === 'completed' ? 'doing' : 'completed',
                )
              }
            >
              <Icon size={13} />
            </button>

            <div className="task-main">
              <div className="task-title-line">
                <span className={classNames('priority-dot', `priority-${task.priority}`)} />
                <strong>{task.title}</strong>
                <TaskStatusBadge status={task.status} />
              </div>
              <p>{task.summary}</p>
              <div className="task-meta">
                {showDate && (
                  <span>
                    <CalendarDays size={12} />
                    {task.date.slice(5).replace('-', '/')}
                  </span>
                )}
                <span>{task.project}</span>
                <span>
                  <Clock3 size={12} />
                  {task.durationMinutes}m
                </span>
                <ToolStack toolIds={task.toolIds} />
              </div>
            </div>

            {!compact && (
              <div className="task-progress">
                <span>
                  <small>完成度</small>
                  <strong>{task.progress}%</strong>
                </span>
                <div>
                  <span style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            )}

            {!compact && (
              <div className="task-result">
                <small>{task.result ? '结果' : '当前状态'}</small>
                <span>
                  {task.result ??
                    (task.status === 'blocked'
                      ? '等待外部条件'
                      : task.status === 'planned'
                        ? '尚未开始'
                        : '正在推进')}
                </span>
              </div>
            )}

            <span className="task-action-wrap">
              <button
                className="icon-button task-more"
                type="button"
                title="任务操作"
                aria-label={`${task.title} 的任务操作`}
                aria-expanded={openMenuId === task.id}
                onClick={() =>
                  setOpenMenuId((current) =>
                    current === task.id ? null : task.id,
                  )
                }
              >
                <MoreHorizontal size={15} />
              </button>
              {openMenuId === task.id && (
                <span className="task-action-menu">
                  {(
                    [
                      ['completed', '标记完成'],
                      ['doing', '标记进行中'],
                      ['planned', '重置为待开始'],
                      ['blocked', '标记受阻'],
                    ] as const
                  ).map(([status, label]) => (
                    <button
                      type="button"
                      key={status}
                      onClick={() => {
                        onStatusChange?.(task.id, status)
                        onTaskAction?.(task.title, `任务状态已更新为“${label}”。`)
                        setOpenMenuId(null)
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `${task.title}\n项目：${task.project}\n状态：${task.status}\n进度：${task.progress}%`,
                      )
                      onTaskAction?.(task.title, '任务信息已复制到剪贴板。')
                      setOpenMenuId(null)
                    }}
                  >
                    复制任务信息
                  </button>
                </span>
              )}
            </span>
          </article>
        )
      })}
    </div>
  )
}
