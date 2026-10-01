import { useMemo } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useChronicle } from '../lib/store'
import {
  dayKeyOf,
  formatClock,
  formatTimeRange,
  sessionTouchesDay,
} from '../lib/format'
import { saveText } from '../lib/desktop'
import type { SessionRecord, ToastMessage } from '../types'

interface TodayPageProps {
  searchQuery: string
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

interface WorkSummaryItem {
  key: string
  project: string
  path: string
  tools: string[]
  count: number
  turns: number
  artifactCount: number
  artifactNames: string[]
  first: number | null
  last: number | null
  focus: string
}

const ARTIFACT_KINDS: Array<{ test: RegExp; label: string }> = [
  { test: /\.(tsx?|jsx?|css|html)$/i, label: '界面与代码' },
  { test: /\.(py|cjs|mjs)$/i, label: '脚本与流程' },
  { test: /\.(md|txt|docx?|pdf)$/i, label: '文档与说明' },
  { test: /\.(json|ya?ml|toml|ini|env)$/i, label: '配置与数据' },
  { test: /\.(png|jpe?g|webp|svg|ico)$/i, label: '视觉素材' },
  { test: /\.(exe|msi|zip|dmg|blockmap)$/i, label: '安装包与发布物' },
]

function basenameOf(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

function artifactKind(path: string): string | null {
  return ARTIFACT_KINDS.find((item) => item.test.test(path))?.label ?? null
}

/* 按工作目录归组，只提炼项目、软件、轮次和真实产出，不展示用户发给 AI 的原文 */
function buildWorkSummary(sessions: SessionRecord[]): WorkSummaryItem[] {
  const projects = new Map<string, WorkSummaryItem & { colorMap: Map<string, string> }>()

  for (const s of sessions) {
    const path = s.projectPath || s.project || '(未知目录)'
    let item = projects.get(path)
    if (!item) {
      item = {
        key: `${s.tool}:${path}`,
        project: s.project || basenameOf(path) || '(未知项目)',
        path,
        tools: [],
        count: 0,
        turns: 0,
        artifactCount: 0,
        artifactNames: [],
        first: null,
        last: null,
        focus: '',
        colorMap: new Map(),
      }
      projects.set(path, item)
    }

    if (!item.tools.includes(s.toolName)) item.tools.push(s.toolName)
    if (!item.colorMap.has(s.toolName)) item.colorMap.set(s.toolName, s.toolColor)
    item.count += 1
    item.turns += s.turns
    if (s.start && (!item.first || s.start < item.first)) item.first = s.start
    const end = s.end || s.start
    if (end && (!item.last || end > item.last)) item.last = end

    for (const artifact of s.artifacts ?? []) {
      item.artifactCount += 1
      if (!item.artifactNames.includes(artifact.name)) item.artifactNames.push(artifact.name)
    }
  }

  const result = [...projects.values()].map((item) => {
    const kinds = new Set<string>()
    const sessionsByPath = sessions.filter((s) => (s.projectPath || s.project || '(未知目录)') === item.path)
    for (const s of sessionsByPath) {
      for (const artifact of s.artifacts ?? []) {
        const kind = artifactKind(artifact.name)
        if (kind) kinds.add(kind)
      }
    }
    item.focus = kinds.size
      ? [...kinds].slice(0, 3).join('、')
      : item.turns > 3
        ? '方案讨论与问题排查'
        : '轻量协作与信息整理'
    return item
  })

  return result
    .sort((a, b) => (b.last || 0) - (a.last || 0))
    .map(({ colorMap: _colorMap, ...item }) => item)
}

function buildDailyReport(sessions: SessionRecord[]): string {
  const lines: string[] = []
  const key = dayKeyOf(Date.now())
  lines.push(`# AI 工作日报 · ${key}`)
  lines.push('')
  const tools = new Set(sessions.map((s) => s.toolName))
  const turns = sessions.reduce((sum, s) => sum + s.turns, 0)
  const artifacts = new Set<string>()
  for (const s of sessions) {
    for (const a of s.artifacts ?? []) artifacts.add(a.path)
  }
  lines.push(
    `今日共 ${sessions.length} 个会话，涉及 ${tools.size} 个软件，${turns} 轮对话，产出 ${artifacts.size} 个文件。`,
  )
  lines.push('')
  lines.push('## 工作摘要')
  lines.push('')
  for (const tool of buildWorkSummary(sessions)) {
    const artifacts = tool.artifactNames.slice(0, 3).join('、')
    const detail = artifacts ? `主要涉及${tool.focus}，产出 ${artifacts}` : `主要涉及${tool.focus}`
    lines.push(
      `- **${tool.project}**（${tool.tools.join(' / ')}，${tool.count} 会话 · ${tool.turns} 轮）：${detail}`,
    )
  }
  lines.push('')
  lines.push('| 时间 | 软件 | 项目 | 做了什么 | 轮次 |')
  lines.push('|---|---|---|---|---|')
  for (const s of sessions) {
    lines.push(
      `| ${formatTimeRange(s.start, s.end)} | ${s.toolName} | ${s.project} | ${(s.artifacts ?? []).length ? `处理 ${(s.artifacts ?? []).length} 个产出文件` : '推进讨论与排查'} | ${s.turns} |`,
    )
  }
  if (artifacts.size) {
    lines.push('')
    lines.push('## 产出文件')
    lines.push('')
    for (const s of sessions) {
      for (const a of s.artifacts ?? []) {
        lines.push(`- ${a.path}（${s.toolName} · ${s.project}）`)
      }
    }
  }
  return lines.join('\n')
}

export function TodayPage({ searchQuery, onToast }: TodayPageProps) {
  const { data, loading, error, isDesktop, refresh } = useChronicle()

  const today = useMemo(() => {
    const key = dayKeyOf(Date.now())
    const all = data?.sessions ?? []
    return all
      .filter((s) => sessionTouchesDay(s, key))
      .sort((a, b) => (b.start || 0) - (a.start || 0))
  }, [data])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return today
    return today.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.project.toLowerCase().includes(q) ||
        s.toolName.toLowerCase().includes(q),
    )
  }, [today, searchQuery])

  const toolSummary = useMemo(() => {
    const map = new Map<string, { name: string; color: string; count: number }>()
    for (const s of today) {
      const cur = map.get(s.tool) || { name: s.toolName, color: s.toolColor, count: 0 }
      cur.count += 1
      map.set(s.tool, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [today])

  const workSummary = useMemo(() => buildWorkSummary(filtered), [filtered])

  const kpis = useMemo(() => {
    if (!today.length) return null
    const turns = today.reduce((sum, s) => sum + s.turns, 0)
    const artifacts = new Set<string>()
    for (const s of today) {
      for (const a of s.artifacts ?? []) artifacts.add(a.path)
    }
    const starts = today.map((s) => s.start as number)
    const ends = today.map((s) => (s.end || s.start) as number)
    return {
      artifacts: artifacts.size,
      turns,
      first: formatClock(Math.min(...starts)),
      last: formatClock(Math.max(...ends)),
      tools: toolSummary.length,
    }
  }, [today, toolSummary])

  async function exportReport() {
    const md = buildDailyReport([...today].reverse())
    const result = await saveText(`AI工作日报-${dayKeyOf(Date.now())}.md`, md)
    onToast({
      tone: result.ok ? 'success' : 'warning',
      title: result.ok ? '日报已导出' : '导出未完成',
      message: result.message ?? '',
    })
  }

  if (!isDesktop) {
    return (
      <div className="page">
        <div className="page-heading">
          <div>
            <span className="page-kicker">今日工作台</span>
            <strong>需要桌面版</strong>
          </div>
        </div>
        <div className="empty-state">
          <strong>真实数据只在桌面版中读取</strong>
          <span>
            AI 轨迹直接解析本机各 AI 软件的会话日志，浏览器预览环境没有文件访问权限。
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
          <strong>今日工作台</strong>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={() => refresh(true)}>
            <RefreshCw size={15} />
            重新采集
          </button>
          {today.length > 0 && (
            <button className="button button-primary" type="button" onClick={exportReport}>
              <Download size={15} />
              导出日报
            </button>
          )}
        </div>
      </div>

      {loading && !data && (
        <div className="page-loading">
          <span />
          正在读取本机 AI 会话日志（首次约 10–20 秒）…
        </div>
      )}

      {error && (
        <div className="empty-state empty-state-error">
          <strong>采集失败</strong>
          <span>{error}</span>
        </div>
      )}

      {data && kpis && (
        <div className="kpi-strip">
          <div className="kpi-card">
            <small>今日会话</small>
            <strong>{today.length}</strong>
          </div>
          <div className="kpi-card">
            <small>使用软件</small>
            <strong>{kpis.tools}</strong>
          </div>
          <div className="kpi-card">
            <small>对话轮次</small>
            <strong>{kpis.turns}</strong>
          </div>
          <div className="kpi-card">
            <small>产出文件</small>
            <strong>{kpis.artifacts}</strong>
          </div>
          <div className="kpi-card">
            <small>活跃时段</small>
            <strong>
              {kpis.first} – {kpis.last}
            </strong>
          </div>
        </div>
      )}

      {data && toolSummary.length > 0 && (
        <div className="tool-summary-row">
          {toolSummary.map((t) => (
            <span className="tool-summary-chip" key={t.name}>
              <span className="tool-chip-dot" style={{ background: t.color }} />
              {t.name} · {t.count} 会话
            </span>
          ))}
        </div>
      )}

      {data && workSummary.length > 0 && (
        <section className="session-section">
          <div className="section-title-row">
            <span className="eyebrow">今天做了什么</span>
            <span className="result-count">按工作目录归组 · 只显示工作结论与产出</span>
          </div>
          <div className="work-summary">
            {workSummary.map((item) => (
              <article className="summary-tool" key={item.key}>
                <div className="summary-tool-head">
                  <strong>{item.project}</strong>
                  <small>{item.focus}</small>
                </div>
                <div className="summary-folder">
                  <div className="summary-folder-path">
                    <strong>
                      {item.count} 个会话 · {item.turns} 轮
                    </strong>
                    <span>{item.tools.join(' / ')}</span>
                    <small>
                      {item.first && item.last ? formatTimeRange(item.first, item.last) : ''}
                    </small>
                  </div>
                  <p className="summary-conclusion">
                    在 <strong>{item.project}</strong> 中推进{item.focus}
                    {item.artifactCount > 0 ? `，累计处理 ${item.artifactCount} 个产出文件。` : '。'}
                  </p>
                  {item.artifactNames.length > 0 && (
                    <ul className="summary-points">
                      {item.artifactNames.slice(0, 4).map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {data && !loading && today.length === 0 && (
        <div className="empty-state">
          <strong>今天还没有会话记录</strong>
          <span>
            去 Codex、Claude Code、ZCode、WorkBuddy 等已接入的软件里干点活，
            回来点「重新采集」就能看到。已接入 {data.sources.filter((x) => x.status === 'connected').length} 个软件。
          </span>
        </div>
      )}

      {data && searchQuery && filtered.length === 0 && today.length > 0 && (
        <div className="empty-state">
          <strong>没有匹配的会话</strong>
          <span>换个关键词试试。</span>
        </div>
      )}
    </div>
  )
}
