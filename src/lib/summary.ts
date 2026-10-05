// 工作摘要与日报生成：纯函数，与 React 无关，便于单元测试
import { dayKeyOf, formatClock, formatDuration, formatTimeRange, shortenPath } from './format'
import type { SessionRecord } from '../types'

export interface WorkSummaryItem {
  key: string
  project: string
  path: string
  /** 该组首个会话的软件色（软件档就是它自己的品牌色，目录档取组内第一个软件） */
  color: string
  tools: string[]
  count: number
  turns: number
  artifactCount: number
  artifactNames: string[]
  first: number | null
  last: number | null
  /** 只写可核对的事实：改了哪些文件；没有文件改动就直说 */
  digest: string
}

/**
 * 归组主键：按工作目录，或按 AI 软件。
 * `tool` 档用于「隐藏目录信息」的默认界面 —— 此时 path 一律留空，
 * 调用方就无从也无处再显示目录名。
 */
export type SummaryGroupBy = 'path' | 'tool'

const ARTIFACT_KINDS: Array<{ test: RegExp; label: string }> = [
  { test: /\.(tsx?|jsx?|css|html)$/i, label: '界面与代码' },
  { test: /\.(py|cjs|mjs)$/i, label: '脚本与流程' },
  { test: /\.(md|txt|docx?|pdf)$/i, label: '文档与说明' },
  { test: /\.(json|ya?ml|toml|ini|env)$/i, label: '配置与数据' },
  { test: /\.(png|jpe?g|webp|svg|ico)$/i, label: '视觉素材' },
  { test: /\.(exe|msi|zip|dmg|blockmap)$/i, label: '安装包与发布物' },
]

export function basenameOf(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || path
  )
}

export function artifactKind(path: string): string | null {
  return ARTIFACT_KINDS.find((item) => item.test.test(path))?.label ?? null
}

/**
 * 按工作目录或按 AI 软件归组，只提炼项目、软件、轮次和真实产出，不展示用户发给 AI 的原文。
 * 单次遍历完成归组与统计（早期实现按项目二次过滤会话，规模大时是 O(n²)）。
 */
export function buildWorkSummary(
  sessions: SessionRecord[],
  groupBy: SummaryGroupBy = 'path',
): WorkSummaryItem[] {
  const groups = new Map<string, WorkSummaryItem>()

  for (const s of sessions) {
    const path = s.projectPath || s.project || '(未知目录)'
    const key = groupBy === 'tool' ? s.tool || s.toolName : path
    let item = groups.get(key)
    if (!item) {
      item = {
        key,
        // 按软件归组时标题就是软件名，path 留空：界面与日报都没有目录可显示
        project: groupBy === 'tool' ? s.toolName : s.project || basenameOf(path) || '(未知项目)',
        path: groupBy === 'tool' ? '' : path,
        color: s.toolColor,
        tools: [],
        count: 0,
        turns: 0,
        artifactCount: 0,
        artifactNames: [],
        first: null,
        last: null,
        digest: '',
      }
      groups.set(key, item)
    }

    if (!item.tools.includes(s.toolName)) item.tools.push(s.toolName)
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

  return [...groups.values()]
    .map((item) => ({
      ...item,
      // 早期这里按「改动文件的扩展名」推一句「界面与代码 / 轻量协作与信息整理」之类的话，
      // 那是猜的、经常不对（一次没落盘的长讨论会被写成「轻量协作」）。现在只写查得到的事实。
      digest: item.artifactNames.length
        ? `改了 ${item.artifactCount} 个文件：${item.artifactNames.slice(0, 3).join('、')}` +
          (item.artifactNames.length > 3 ? ` 等 ${item.artifactNames.length} 个` : '')
        : '未检测到文件改动',
    }))
    .sort((a, b) => (b.last || 0) - (a.last || 0))
}

/** 单行文本压缩并截断，避免一行塞进整段用户输入把日报撑成流水账 */
function cleanLine(text: string, max = 64): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

/** 会话「做了什么」：优先用真实标题，没有标题时按产出文件退化描述 */
function describeSession(s: SessionRecord): string {
  const title = cleanLine(s.title ?? '')
  if (title) return title
  const count = (s.artifacts ?? []).length
  if (count) return `处理 ${count} 个产出文件`
  return '推进讨论与排查'
}

/** 活跃时段与跨度 */
function activeWindow(sessions: SessionRecord[]): { text: string; span: string } {
  const starts = sessions.map((s) => s.start).filter((v): v is number => typeof v === 'number')
  const ends = sessions
    .map((s) => s.end || s.start)
    .filter((v): v is number => typeof v === 'number')
  if (!starts.length) return { text: '时间未知', span: '' }
  const first = Math.min(...starts)
  const last = Math.max(...ends)
  const span = Math.round((last - first) / 60_000)
  const text = first === last ? formatClock(first) : `${formatClock(first)} – ${formatClock(last)}`
  return { text, span: span > 0 ? formatDuration(span) : '' }
}

const ARTIFACT_LIST_CAP = 8

/** 产出按类型归类，同类型内截断，避免几十个文件铺成一面墙 */
function groupArtifacts(sessions: SessionRecord[]): Array<{ kind: string; paths: string[] }> {
  const byKind = new Map<string, Map<string, string>>()
  for (const s of sessions) {
    for (const a of s.artifacts ?? []) {
      const kind = artifactKind(a.name) ?? '其他'
      let bucket = byKind.get(kind)
      if (!bucket) {
        bucket = new Map<string, string>()
        byKind.set(kind, bucket)
      }
      // 用相对项目根目录的短路径：既看得出位置，又不会是长绝对路径
      bucket.set(a.path, shortenPath(a.path, s.projectPath || s.project))
    }
  }
  return [...byKind.entries()]
    .map(([kind, bucket]) => ({ kind, paths: [...bucket.values()] }))
    .sort((a, b) => b.paths.length - a.paths.length)
}

/**
 * 生成 Markdown 日报。
 *
 * 设计取舍：既要「一眼看懂」（开头一句话总览 + 概览表 + 按项目归纳），
 * 又要「查得到细节」（完整会话清单 + 按类型归类的产出文件）。
 * 因此按项目段落写清「做了什么」，会话表只保留一行一条，产出按类型截断，
 * 不在三处重复同样的项目名。不含用户输入原文，只保留会话标题。
 */
export function buildDailyReport(
  sessions: SessionRecord[],
  now = Date.now(),
  groupBy: SummaryGroupBy = 'path',
): string {
  const lines: string[] = []
  const day = dayKeyOf(now)
  lines.push(`# AI 工作日报 · ${day}`)
  lines.push('')

  if (sessions.length === 0) {
    lines.push('今天没有检测到 AI 会话记录。')
    return lines.join('\n')
  }

  const tools = [...new Set(sessions.map((s) => s.toolName))]
  const turns = sessions.reduce((sum, s) => sum + s.turns, 0)
  const artifacts = groupArtifacts(sessions)
  const artifactTotal = artifacts.reduce((sum, group) => sum + group.paths.length, 0)
  const window = activeWindow(sessions)
  const projects = buildWorkSummary(sessions, groupBy)

  // 一句话总览
  const lead =
    groupBy === 'tool'
      ? `今天在 ${projects.length} 款 AI 软件里完成 ${sessions.length} 个会话、${turns} 轮对话，` +
        (artifactTotal ? `产出 ${artifactTotal} 个文件。` : '没有检测到文件改动。')
      : `今天在 ${projects.length} 个目录用了 ${tools.length} 个软件，` +
        `完成 ${sessions.length} 个会话、${turns} 轮对话，` +
        (artifactTotal ? `产出 ${artifactTotal} 个文件。` : '没有检测到文件改动。')
  lines.push(lead)
  lines.push('')

  // 概览：一张表说清规模
  lines.push('## 概览')
  lines.push('')
  lines.push('| 项目 | 值 |')
  lines.push('|---|---|')
  lines.push(`| 会话 | ${sessions.length} 个 |`)
  const toolText =
    tools.length > 4 ? `${tools.slice(0, 4).join('、')} 等 ${tools.length} 个` : tools.join('、')
  lines.push(`| 软件 | ${toolText} |`)
  lines.push(`| 对话轮次 | ${turns} 轮 |`)
  lines.push(`| 活跃时段 | ${window.text}${window.span ? `（跨度 ${window.span}）` : ''} |`)
  if (artifactTotal) {
    const kindText = artifacts.map((g) => `${g.kind} ${g.paths.length}`).join('、')
    lines.push(`| 产出文件 | ${artifactTotal} 个（${kindText}） |`)
  }

  // 按归组主键写「做了什么」：这是日报主体
  lines.push('')
  lines.push('## 做了什么')
  lines.push('')
  const byProject = new Map<string, SessionRecord[]>()
  for (const s of sessions) {
    const key =
      groupBy === 'tool' ? s.tool || s.toolName : s.projectPath || s.project || '(未知目录)'
    const bucket = byProject.get(key)
    if (bucket) bucket.push(s)
    else byProject.set(key, [s])
  }
  for (const item of projects) {
    const bucket = (byProject.get(item.key) ?? [])
      .slice()
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    const when =
      item.first && item.last ? `${formatClock(item.first)}–${formatClock(item.last)}` : '时间未知'
    // 按软件归组时标题本身就是软件名，再列一遍工具属于重复信息
    const toolTail = groupBy === 'tool' ? '' : ` · ${item.tools.join(' / ')}`
    lines.push(`### ${item.project}${toolTail} · ${item.count} 会话 · ${item.turns} 轮 · ${when}`)
    lines.push('')
    // 产出说明紧跟项目标题，避免挂在最后一条会话下面被误读成该会话的产物
    if (item.artifactCount) {
      lines.push(item.digest)
      lines.push('')
    }
    for (const s of bucket.slice(0, 12)) {
      lines.push(`- ${describeSession(s)}（${s.toolName} · ${s.turns} 轮）`)
    }
    if (bucket.length > 12) {
      lines.push(`- 其余 ${bucket.length - 12} 个会话见下方完整清单`)
    }
    lines.push('')
  }

  // 完整会话清单：一行一条，便于检索
  lines.push('## 全部会话')
  lines.push('')
  lines.push('| 时间 | 软件 | 做了什么 | 轮次 |')
  lines.push('|---|---|---|---|')
  const ordered = sessions.slice().sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  for (const s of ordered) {
    lines.push(
      `| ${formatTimeRange(s.start, s.end)} | ${s.toolName} | ${describeSession(s)} | ${s.turns} |`,
    )
  }

  // 产出文件：按类型归类并截断
  if (artifactTotal) {
    lines.push('')
    lines.push('## 产出文件')
    lines.push('')
    for (const group of artifacts) {
      const shown = group.paths.slice(0, ARTIFACT_LIST_CAP).join('、')
      const rest = group.paths.length - ARTIFACT_LIST_CAP
      lines.push(
        `- **${group.kind}**（${group.paths.length}）：${shown}${rest > 0 ? `，还有 ${rest} 个` : ''}`,
      )
    }
  }

  return lines.join('\n')
}
