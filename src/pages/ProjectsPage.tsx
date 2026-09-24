import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Layers3,
  MoreHorizontal,
  PlayCircle,
} from 'lucide-react'
import { artifacts, projects, taskItems } from '../data/mockData'
import { openLocalPath } from '../lib/desktop'
import type { TaskStatus, ToastMessage } from '../types'
import { StackedProgress, ToolStack } from '../components/StatusBadges'
import { TaskLedger } from '../components/TaskLedger'
import { classNames } from '../lib/utils'

interface ProjectsPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

type ProjectFilter = 'all' | 'active' | 'paused' | 'completed'

export function ProjectsPage({ searchQuery, onToast }: ProjectsPageProps) {
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id)
  const [taskScope, setTaskScope] = useState<'project' | 'all'>('project')
  const [tasks, setTasks] = useState(taskItems)
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null)

  const filteredProjects = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    return projects.filter((project) => {
      const statusMatches = filter === 'all' || project.status === filter
      const textMatches =
        !normalized ||
        [project.name, project.description, project.nextStep]
          .join(' ')
          .toLowerCase()
          .includes(normalized)
      return statusMatches && textMatches
    })
  }, [filter, searchQuery])

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0]
  const selectedArtifacts = artifacts.filter(
    (artifact) => artifact.project === selectedProject.name,
  )
  const visibleTasks =
    taskScope === 'project'
      ? tasks.filter((task) => task.project === selectedProject.name)
      : tasks

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status } : task)),
    )
  }

  return (
    <div className="page projects-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <FolderKanban size={14} />
            跨软件工作线程
          </span>
          <h1>项目视图</h1>
          <p>不按软件切割工作，把 Codex、Qoder、CatPaw 等会话归入真实项目。</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() =>
            onToast({
              tone: 'success',
              title: '项目追踪已开启',
              message: '新会话会根据项目路径和窗口上下文自动归档。',
            })
          }
        >
          <Layers3 size={15} />
          自动归档
        </button>
      </section>

      <section className="project-summary-strip">
        <div>
          <small>进行中</small>
          <strong>2</strong>
          <span>个项目</span>
        </div>
        <div>
          <small>本周投入</small>
          <strong>15h 40m</strong>
          <span>较上周 +12%</span>
        </div>
        <div>
          <small>跨软件会话</small>
          <strong>42</strong>
          <span>覆盖 9 个软件</span>
        </div>
        <div>
          <small>已关联成果</small>
          <strong>29</strong>
          <span>关联率 84%</span>
        </div>
      </section>

      <div className="segmented-control project-filter" role="tablist" aria-label="项目状态筛选">
        {(
          [
            ['all', '全部'],
            ['active', '进行中'],
            ['paused', '已暂停'],
            ['completed', '已完成'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={classNames(filter === value && 'segmented-active')}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="projects-layout">
        <section className="project-grid">
          {filteredProjects.map((project) => {
            const projectArtifacts = artifacts.filter(
              (artifact) => artifact.project === project.name,
            )
            return (
              <article
                className={classNames(
                  'project-card',
                  selectedProject.id === project.id && 'project-card-selected',
                )}
                key={project.id}
                style={{ '--project-color': project.color } as React.CSSProperties}
              >
                <button
                  className="project-card-hitbox"
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  aria-label={`查看 ${project.name}`}
                />
                <header>
                  <span className="project-mark">
                    <span />
                  </span>
                  <div>
                    <span className="project-status">
                      {project.status === 'active'
                        ? '进行中'
                        : project.status === 'paused'
                          ? '已暂停'
                          : '已完成'}
                    </span>
                    <h2>{project.name}</h2>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    title="更多项目操作"
                    aria-label="更多项目操作"
                    aria-expanded={openProjectMenuId === project.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenProjectMenuId((current) =>
                        current === project.id ? null : project.id,
                      )
                    }}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                  {openProjectMenuId === project.id && (
                    <span className="project-action-menu">
                      <button
                        type="button"
                        onClick={() => {
                          onToast({
                            tone: 'info',
                            title: project.name,
                            message: '项目详情已准备，可直接在右侧面板继续查看。',
                          })
                          setOpenProjectMenuId(null)
                        }}
                      >
                        查看详情
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToast({
                            tone: 'success',
                            title: '项目已归档',
                            message: `${project.name} 已移入历史项目。`,
                          })
                          setOpenProjectMenuId(null)
                        }}
                      >
                        归档项目
                      </button>
                    </span>
                  )}
                </header>
                <p>{project.description}</p>
                <div className="project-progress">
                  <span>
                    <small>进度</small>
                    <strong>{project.progress}%</strong>
                  </span>
                  <StackedProgress value={project.progress} />
                </div>
                <div className="project-stats">
                  <span>
                    <Clock3 size={14} />
                    {Math.floor(project.minutesThisWeek / 60)}h{' '}
                    {project.minutesThisWeek % 60}m
                  </span>
                  <span>{project.sessions} 次会话</span>
                  <span>{projectArtifacts.length} 个成果</span>
                </div>
                <footer>
                  <ToolStack toolIds={project.tools} max={4} />
                  <span className="artifact-count">
                    {selectedProject.id === project.id && <ArrowUpRight size={14} />}
                    最近活动 {project.lastActive}
                  </span>
                </footer>
              </article>
            )
          })}
        </section>

        <aside className="project-detail">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">项目详情</span>
              <h3>{selectedProject.name}</h3>
            </div>
            <span className="project-detail-status">
              {selectedProject.status === 'active' ? '进行中' : '已归档'}
            </span>
          </div>

          <div className="project-next-step">
            <span className="project-next-icon">
              <PlayCircle size={17} />
            </span>
            <div>
              <small>下一步</small>
              <strong>{selectedProject.nextStep}</strong>
            </div>
          </div>

          <div className="project-detail-block">
            <div className="section-title-row">
              <span>近期成果</span>
              <small>{selectedArtifacts.length} 项</small>
            </div>
            <div className="compact-artifact-list">
              {selectedArtifacts.slice(0, 4).map((artifact) => {
                const Icon = artifact.icon
                return (
                  <button
                    type="button"
                    key={artifact.id}
                    onClick={async () => {
                      const result = await openLocalPath(artifact.path)
                      onToast({
                        tone: result.ok ? 'success' : 'warning',
                        title: result.ok ? `已打开 ${artifact.name}` : '无法打开成果',
                        message: result.message ?? artifact.path,
                      })
                    }}
                  >
                    <span className="artifact-icon">
                      <Icon size={15} />
                    </span>
                    <span>
                      <strong>{artifact.name}</strong>
                      <small>{artifact.modifiedAt}</small>
                    </span>
                    <CheckCircle2 size={13} />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="project-detail-block">
            <div className="section-title-row">
              <span>参与软件</span>
              <small>{selectedProject.tools.length} 个</small>
            </div>
            <ToolStack toolIds={selectedProject.tools} max={8} />
          </div>
        </aside>
      </div>

      <section className="surface recent-tasks-section">
        <header className="surface-header">
          <div>
            <span className="section-kicker">历史任务</span>
            <h2>{taskScope === 'project' ? `${selectedProject.name}的任务账本` : '全部任务账本'}</h2>
          </div>
          <div className="segmented-control task-scope-control">
            <button
              type="button"
              className={classNames(taskScope === 'project' && 'segmented-active')}
              onClick={() => setTaskScope('project')}
            >
              当前项目
            </button>
            <button
              type="button"
              className={classNames(taskScope === 'all' && 'segmented-active')}
              onClick={() => setTaskScope('all')}
            >
              全部历史
            </button>
          </div>
        </header>
        <TaskLedger
          tasks={visibleTasks}
          showDate
          onStatusChange={changeTaskStatus}
          onTaskAction={(title, message) =>
            onToast({ tone: 'success', title, message })
          }
        />
      </section>
    </div>
  )
}
