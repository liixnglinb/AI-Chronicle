import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Sparkles,
} from 'lucide-react'
import { historyDays, taskItems } from '../data/mockData'
import { saveText } from '../lib/desktop'
import { classNames } from '../lib/utils'
import type { TaskStatus, ToastMessage } from '../types'
import { ToolStack } from '../components/StatusBadges'
import { TaskLedger } from '../components/TaskLedger'

type HistoryTaskFilter = 'all' | TaskStatus

const monthDays = Array.from({ length: 30 }, (_, index) => index + 1)
const leadingEmpty = (new Date(2026, 8, 1).getDay() + 6) % 7
const calendarCells: Array<number | null> = [
  ...Array.from({ length: leadingEmpty }, () => null),
  ...monthDays,
]

interface HistoryPageProps {
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function HistoryPage({ onToast }: HistoryPageProps) {
  const [selectedDate, setSelectedDate] = useState('2026-09-24')
  const [taskFilter, setTaskFilter] = useState<HistoryTaskFilter>('all')
  const [tasks, setTasks] = useState(taskItems)

  const selectedDay =
    historyDays.find((day) => day.date === selectedDate) ?? historyDays[0]
  const selectedDateNumber = Number(selectedDate.slice(-2))

  const selectedTasks = tasks.filter(
    (task) =>
      task.date === selectedDate &&
      (taskFilter === 'all' || task.status === taskFilter),
  )

  const completionRate = Math.round(
    (historyDays.reduce((sum, day) => sum + day.tasksCompleted, 0) /
      historyDays.reduce((sum, day) => sum + day.tasksPlanned, 0)) *
      100,
  )

  function moveDay(direction: -1 | 1) {
    const currentIndex = historyDays.findIndex((day) => day.date === selectedDate)
    const nextIndex = Math.max(
      0,
      Math.min(historyDays.length - 1, currentIndex + direction),
    )
    setSelectedDate(historyDays[nextIndex].date)
  }

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    )
  }

  async function exportMonthReport() {
    const content = [
      '# AI 工作月报 · 2026 年 9 月',
      '',
      '## 月度概览',
      '- AI 活跃：86 小时 24 分',
      '- 完成任务：63',
      `- 记录天数：${historyDays.length}`,
      '- 历史成果：142',
      '',
      '## 每日记录',
      ...historyDays.map(
        (day) =>
          `- ${day.date} ${day.weekday}：${day.headline}，${Math.floor(day.minutes / 60)} 小时 ${day.minutes % 60} 分，任务 ${day.tasksCompleted}/${day.tasksPlanned}`,
      ),
    ].join('\n')
    const result = await saveText('AI工作月报-2026-09.md', content)
    onToast({
      tone: 'success',
      title: '月报已导出',
      message: result.message ?? 'Markdown 月报已经保存。',
    })
  }

  return (
    <div className="page history-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <CalendarRange size={14} />
            每日工作档案
          </span>
          <h1>历史</h1>
          <p>按天回看 AI 做了什么、完成了哪些任务，以及成果是怎样积累起来的。</p>
        </div>
        <div className="heading-actions">
          <span className="live-pill">
            <CheckCircle2 size={13} />
            已保存 18 天
          </span>
          <button
            className="button button-secondary"
            type="button"
            onClick={exportMonthReport}
          >
            <Download size={14} />
            导出月报
          </button>
        </div>
      </section>

      <section className="history-summary-strip">
        <div>
          <small>本月 AI 活跃</small>
          <strong>86h 24m</strong>
          <span>较上月 +14%</span>
        </div>
        <div>
          <small>完成任务</small>
          <strong>63</strong>
          <span>{completionRate}% 完成率</span>
        </div>
        <div>
          <small>连续记录</small>
          <strong>18 天</strong>
          <span>个人最佳 31 天</span>
        </div>
        <div>
          <small>历史成果</small>
          <strong>142</strong>
          <span>关联率 89%</span>
        </div>
      </section>

      <div className="history-calendar-layout">
        <section className="surface history-calendar-panel">
          <header className="surface-header">
            <div>
              <span className="section-kicker">月度视图</span>
              <h2>2026 年 9 月</h2>
            </div>
            <div className="calendar-nav">
              <button
                className="icon-button"
                type="button"
                title="上一天"
                aria-label="上一天"
                onClick={() => moveDay(1)}
              >
                <ArrowLeft size={15} />
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setSelectedDate('2026-09-24')}
              >
                回到今天
              </button>
              <button
                className="icon-button"
                type="button"
                title="下一天"
                aria-label="下一天"
                onClick={() => moveDay(-1)}
              >
                <ArrowRight size={15} />
              </button>
            </div>
          </header>

          <div className="history-calendar">
            {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
              <span className="calendar-weekday" key={weekday}>
                {weekday}
              </span>
            ))}
            {calendarCells.map((dayNumber, index) => {
              if (!dayNumber) {
                return <span className="calendar-day calendar-day-empty" key={`empty-${index}`} />
              }
              const date = `2026-09-${String(dayNumber).padStart(2, '0')}`
              const history = historyDays.find((item) => item.date === date)
              const selected = date === selectedDate
              const future = dayNumber > 24

              return (
                <button
                  className={classNames(
                    'calendar-day',
                    history && 'calendar-day-recorded',
                    selected && 'calendar-day-selected',
                    future && 'calendar-day-future',
                  )}
                  type="button"
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  disabled={future || !history}
                >
                  <span className="calendar-day-number">{dayNumber}</span>
                  {history ? (
                    <>
                      <strong>{Math.floor(history.minutes / 60)}h {history.minutes % 60}m</strong>
                      <span className="calendar-day-tasks">
                        {Array.from(
                          { length: Math.min(4, history.tasksCompleted) },
                          (_, taskIndex) => (
                            <i key={taskIndex} />
                          ),
                        )}
                      </span>
                    </>
                  ) : (
                    <small>{future ? '未来' : '无记录'}</small>
                  )}
                </button>
              )
            })}
          </div>

          <div className="calendar-legend">
            <span>
              <i className="legend-scale legend-scale-low" />
              1 小时内
            </span>
            <span>
              <i className="legend-scale legend-scale-mid" />
              1-4 小时
            </span>
            <span>
              <i className="legend-scale legend-scale-high" />
              4 小时以上
            </span>
          </div>
        </section>

        <aside className="surface selected-day-brief">
          <div className="selected-day-date">
            <span>{selectedDay.weekday}</span>
            <strong>{selectedDateNumber}</strong>
            <small>2026 / 09</small>
          </div>
          <div className="selected-day-heading">
            <span className="section-kicker">当天概览</span>
            <h2>{selectedDay.headline}</h2>
            <p>{selectedDay.summary}</p>
          </div>
          <div className="selected-day-metrics">
            <div>
              <small>活跃时长</small>
              <strong>
                {Math.floor(selectedDay.minutes / 60)}h {selectedDay.minutes % 60}m
              </strong>
            </div>
            <div>
              <small>完成任务</small>
              <strong>
                {selectedDay.tasksCompleted}/{selectedDay.tasksPlanned}
              </strong>
            </div>
            <div>
              <small>有效会话</small>
              <strong>{selectedDay.sessionCount}</strong>
            </div>
            <div>
              <small>产出</small>
              <strong>{selectedDay.artifactCount}</strong>
            </div>
          </div>
          <button
            className="selected-day-project"
            type="button"
            onClick={() =>
              onToast({
                tone: 'info',
                title: selectedDay.primaryProject,
                message: `已定位到 ${selectedDay.primaryProject} 在该日期的全部工作记录。`,
              })
            }
          >
            <span className="selected-day-project-icon">
              <Sparkles size={15} />
            </span>
            <span>
              <small>主要项目</small>
              <strong>{selectedDay.primaryProject}</strong>
            </span>
            <ChevronRight size={15} />
          </button>
          <div className="selected-day-tools">
            <span>参与软件</span>
            <ToolStack toolIds={selectedDay.toolIds} max={8} />
          </div>
        </aside>
      </div>

      <section className="surface history-task-section">
        <header className="surface-header">
          <div>
            <span className="section-kicker">任务档案</span>
            <h2>{selectedDay.date.slice(5).replace('-', ' / ')} 的任务</h2>
          </div>
          <div className="task-filter-tabs" role="tablist" aria-label="任务状态筛选">
            {(
              [
                ['all', '全部'],
                ['completed', '已完成'],
                ['doing', '进行中'],
                ['planned', '待开始'],
                ['blocked', '受阻'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={taskFilter === value}
                className={classNames(taskFilter === value && 'task-filter-active')}
                onClick={() => setTaskFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        <TaskLedger
          tasks={selectedTasks}
          onStatusChange={changeTaskStatus}
          onTaskAction={(title, message) =>
            onToast({ tone: 'success', title, message })
          }
        />
      </section>

      <section className="history-week-strip">
        <header>
          <div>
            <span className="section-kicker">最近记录</span>
            <h2>工作节奏</h2>
          </div>
          <span className="header-note">点击日期快速回看</span>
        </header>
        <div className="history-day-scroller">
          {historyDays.slice(0, 7).map((day) => (
            <button
              key={day.date}
              type="button"
              className={classNames(
                'history-day-card',
                day.date === selectedDate && 'history-day-card-selected',
              )}
              onClick={() => setSelectedDate(day.date)}
            >
              <span>
                <small>{day.weekday}</small>
                <strong>{day.day}</strong>
              </span>
              <span className="history-day-card-time">
                <Clock3 size={12} />
                {Math.floor(day.minutes / 60)}h {day.minutes % 60}m
              </span>
              <p>{day.headline}</p>
              <span className="history-day-card-footer">
                <span>{day.primaryProject}</span>
                <span>
                  <CheckCircle2 size={11} />
                  {day.tasksCompleted}/{day.tasksPlanned}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
