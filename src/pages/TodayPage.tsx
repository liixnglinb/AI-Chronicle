import { useMemo } from 'react'
import { Download, ExternalLink, FileCode, Sparkles } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatClock,
  formatDuration,
  formatTimeRange,
  sessionDurationMinutes,
  sessionTouchesDay,
} from '../lib/format'
import { buildDailyReport, buildWorkSummary } from '../lib/summary'
import { projectDisplayName } from '../lib/paths'
import { openLocalPath, saveText } from '../lib/desktop'
import { EmptyState, DesktopOnlyPage } from '../components/EmptyState'
import { SkeletonPage } from '../components/Skeleton'
import type { ToastMessage } from '../types'

interface TodayPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

/**
 * 今日工作台：三层穿透结构。
 *   层级 1（决策顶栏）今日一句话结论 + 指标微型矩阵
 *   层级 2（成果透镜）  最新改动文件，可直接打开
 *   层级 3（项目聚合）  按工作目录折叠群 + 一键导出日报
 * 目标是把「今天干了什么」压缩到一屏内可读完，而不是流水账。
 */
export function TodayPage({ searchQuery, onToast }: TodayPageProps) {
  const { data, loading, isDesktop, settings } = useChronicle()
  // 目录信息默认隐藏（设置中心可打开）：主键随之从工作目录换成 AI 软件
  const showPaths = settings.showProjectPaths
  const groupBy = showPaths ? 'path' : ('tool' as const)

  const todayKey = useMemo(() => dayKeyOf(Date.now()), [])

  const todaySessions = useMemo(() => {
    return (data?.sessions ?? [])
      .filter((s) => sessionTouchesDay(s, todayKey))
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data, todayKey])

  const workSummary = useMemo(
    () => buildWorkSummary(todaySessions, groupBy),
    [todaySessions, groupBy],
  )

  // 层级 3 的过滤：按项目名 / 核心事项 / 工具名匹配当前视图的搜索词
  const filteredSummary = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return workSummary
    return workSummary.filter(
      (w) =>
        w.project.toLowerCase().includes(q) ||
        w.path.toLowerCase().includes(q) ||
        w.focus.toLowerCase().includes(q) ||
        w.tools.some((t) => t.toLowerCase().includes(q)),
    )
  }, [workSummary, searchQuery])

  // 层级 2：最新 6 个改动文件（按 mtime 倒序，同一路径只取一次）
  const todayArtifacts = useMemo(() => {
    const seen = new Set<string>()
    const list: Array<{
      name: string
      path: string
      mtime: number
      project: string
      toolName: string
      toolColor: string
    }> = []
    const all: Array<{
      name: string
      path: string
      mtime: number
      project: string
      toolName: string
      toolColor: string
    }> = []
    for (const s of todaySessions) {
      for (const a of s.artifacts ?? []) {
        all.push({
          name: a.name,
          path: a.path,
          mtime: a.mtime,
          // 目录隐藏时不带 project，胶囊改显示「哪个软件改的」
          project: showPaths ? projectDisplayName(s.projectPath || s.project) : '',
          toolName: s.toolName,
          toolColor: s.toolColor,
        })
      }
    }
    all.sort((a, b) => b.mtime - a.mtime)
    for (const item of all) {
      if (seen.has(item.path)) continue
      seen.add(item.path)
      list.push(item)
      if (list.length >= 6) break
    }
    return list
  }, [todaySessions, showPaths])

  const kpis = useMemo(() => {
    if (todaySessions.length === 0) return null
    const toolCount = new Set(todaySessions.map((s) => s.tool)).size
    const turns = todaySessions.reduce((sum, s) => sum + s.turns, 0)
    const artifactPaths = new Set<string>()
    for (const s of todaySessions) {
      for (const a of s.artifacts ?? []) artifactPaths.add(a.path)
    }
    const starts = todaySessions.map((s) => s.start).filter((v): v is number => v !== null)
    const ends = todaySessions.map((s) => s.end || s.start).filter((v): v is number => v !== null)
    const activeMinutes = todaySessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0)
    const first = starts.length ? Math.min(...starts) : null
    const last = ends.length ? Math.max(...ends) : null
    const spanMinutes = first !== null && last !== null ? Math.round((last - first) / 60_000) : 0
    return {
      toolCount,
      turns,
      artifacts: artifactPaths.size,
      projects: workSummary.length,
      first: first === null ? '—' : formatClock(first),
      last: last === null ? '—' : formatClock(last),
      span: formatDuration(spanMinutes) || '—',
      active: formatDuration(activeMinutes) || '—',
    }
  }, [todaySessions, workSummary])

  // 所有项目路径，用于计算唯一后缀（Monorepo 撞名消歧）
  const allProjectPaths = useMemo(
    () => (data?.sessions ?? []).map((s) => s.projectPath || s.project).filter(Boolean),
    [data],
  )

  async function handleExport() {
    if (todaySessions.length === 0) return
    const md = buildDailyReport([...todaySessions].reverse(), Date.now(), groupBy)
    const fileName = `AI工作日报-${todayKey}.md`
    const result = await saveText(fileName, md)
    onToast(
      result.ok
        ? { tone: 'success', title: '日报导出成功', message: `文件已写入：${fileName}` }
        : { tone: 'warning', title: '导出未完成', message: result.message ?? '请重试' },
    )
  }

  if (!isDesktop) {
    return (
      <DesktopOnlyPage
        title="今日工作台"
        description="AI 轨迹直接解析本机各 AI 软件的会话日志，浏览器预览环境没有文件访问权限。"
      />
    )
  }

  if (loading && !data) return <SkeletonPage cards={4} rows={4} />

  if (data && todaySessions.length === 0) {
    const connected = data.sources.filter((s) => s.status === 'connected').length
    return (
      <EmptyState
        title="今日暂无 AI 工作轨迹"
        description={`当前已接入 ${connected} 个软件。启动 Codex、Claude Code 或 WorkBuddy 进行编码，本地会话将在此实时聚合。`}
        actions={
          <button onClick={() => void handleExport()} className="desk-btn-secondary" disabled>
            <Download size={13} />
            <span>导出 Markdown 日报</span>
          </button>
        }
      />
    )
  }

  return (
    <div className="desk-today-grid">
      {/* ---------- 层级 1：决策顶栏 ---------- */}
      <div className="desk-panel desk-kpi-banner desk-enter">
        <div className="desk-kpi-main">
          <span className="desk-kpi-tag">
            <Sparkles size={13} />
            <span>今日工作概况</span>
          </span>
          <h2 className="desk-kpi-lead">
            {kpis
              ? showPaths
                ? `共调用 ${kpis.toolCount} 款 AI 工具，在 ${kpis.projects} 个工作目录完成 ${todaySessions.length} 场会话。`
                : `共调用 ${kpis.toolCount} 款 AI 工具，完成 ${todaySessions.length} 场会话。`
              : '今日暂无会话'}
          </h2>
          {kpis && (
            <div className="desk-kpi-matrix">
              <div className="desk-kpi-cell">
                <small>会话数</small>
                <strong>{todaySessions.length}</strong>
              </div>
              <div className="desk-kpi-cell">
                <small>交互轮次</small>
                <strong>{kpis.turns}</strong>
              </div>
              <div className="desk-kpi-cell">
                <small>改动文件</small>
                <strong>{kpis.artifacts}</strong>
              </div>
              <div className="desk-kpi-cell">
                <small>活跃时段</small>
                <strong>
                  {kpis.first}–{kpis.last}
                </strong>
              </div>
              <div className="desk-kpi-cell">
                <small>跨度 / 有效</small>
                <strong>
                  {kpis.span} · {kpis.active}
                </strong>
              </div>
            </div>
          )}
        </div>
        <div className="desk-kpi-actions">
          <button onClick={() => void handleExport()} className="desk-btn-primary">
            <Download size={13} />
            <span>导出 Markdown 日报</span>
          </button>
        </div>
      </div>

      {/* ---------- 层级 2：成果透镜 ---------- */}
      {todayArtifacts.length > 0 && (
        <div className="desk-panel desk-artifacts-deck desk-enter">
          <div className="desk-section-head">
            <span className="desk-panel-title">
              <FileCode size={14} />
              <span>实时改动产出</span>
              <small>由会话窗口捕获的被编辑代码与文件</small>
            </span>
          </div>
          <div className="desk-artifact-chips">
            {todayArtifacts.map((art) => (
              <button
                key={art.path}
                className="desk-artifact-chip"
                onClick={() => void openLocalPath(art.path)}
                title={showPaths ? art.path : art.name}
              >
                <FileCode size={13} style={{ color: art.toolColor }} />
                <span className="desk-chip-name">{art.name}</span>
                <span className="desk-chip-proj">
                  {showPaths ? `(${art.project})` : art.toolName}
                </span>
                <ExternalLink size={10} className="desk-chip-open" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- 层级 3：项目聚合折叠群 ---------- */}
      <div className="desk-project-summary-list">
        {filteredSummary.map((item) => {
          // 目录档用消歧后的项目名（Monorepo 同名要靠祖先段区分），软件档直接用软件名
          const display = showPaths ? projectDisplayName(item.path, allProjectPaths) : item.project
          return (
            <div key={item.key} className="desk-panel desk-summary-card desk-enter">
              <div className="desk-summary-card-head">
                <div className="desk-summary-id">
                  <span className="desk-summary-proj">{display}</span>
                  {showPaths && (
                    <span className="desk-summary-path" title={item.path}>
                      {item.path}
                    </span>
                  )}
                </div>
                <div className="desk-summary-meta">
                  <span className="desk-meta-badge">{item.count} 次会话</span>
                  <span className="desk-meta-badge">{item.turns} 轮交互</span>
                  {item.artifactCount > 0 && (
                    <span className="desk-meta-badge">{item.artifactCount} 个产出</span>
                  )}
                </div>
              </div>

              <div className="desk-summary-focus">
                <strong>核心事项：</strong>
                <span>{item.focus}</span>
                {item.first !== null && item.last !== null && (
                  <span className="desk-summary-window">
                    {' '}
                    · 活跃 {formatTimeRange(item.first, item.last)}
                  </span>
                )}
              </div>

              <div className="desk-summary-tools">
                {/* 软件档的标题已经是软件名，再列一遍工具标签是重复信息 */}
                {showPaths &&
                  item.tools.map((t) => (
                    <span key={t} className="desk-tool-tag">
                      {t}
                    </span>
                  ))}
                {item.artifactNames.length > 0 && (
                  <span className="desk-tool-tag">
                    代表产出：{item.artifactNames.slice(0, 3).join('、')}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {filteredSummary.length === 0 && searchQuery.trim() && (
          <EmptyState
            compact
            title="没有匹配的项目聚合"
            description={`换个关键词，或清空顶部过滤条件查看今日全部${showPaths ? '工作目录' : '软件聚合'}。`}
          />
        )}
      </div>
    </div>
  )
}
