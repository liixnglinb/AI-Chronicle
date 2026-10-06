import type { SessionRecord } from '../types'

/**
 * 会话搜索的唯一口径：标题 / 项目 / 完整路径 / 模型 / 软件名 / 产出文件名。
 *
 * 以前每个页面各写一份 `text.toLowerCase().includes(q)` 的字段清单，结果两份漏字段：
 * 时间轴与命令面板搜不到模型名，也搜不到「改过哪个文件」——用户记得文件名却搜不出来。
 * 新增可搜索字段只需要改这里一处。
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

export function matchSession(session: SessionRecord, query: string): boolean {
  const q = normalizeQuery(query)
  if (!q) return true
  return (
    session.title.toLowerCase().includes(q) ||
    session.project.toLowerCase().includes(q) ||
    session.projectPath.toLowerCase().includes(q) ||
    session.model.toLowerCase().includes(q) ||
    session.toolName.toLowerCase().includes(q) ||
    (session.artifacts ?? []).some((a) => a.name.toLowerCase().includes(q))
  )
}
