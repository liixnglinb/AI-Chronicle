import { Clock } from 'lucide-react'
import { formatTimeRange } from '../lib/format'
import { projectDisplayName } from '../lib/paths'
import { openLocalWithToast } from '../lib/desktop'
import { ToolMark } from './ToolMark'
import type { SessionRecord, ToastMessage } from '../types'

interface SessionRowProps {
  session: SessionRecord
  showPaths: boolean
  /** 全量目录列表：projectDisplayName 靠它决定显示到哪一层才不歧义 */
  allProjectPaths: string[]
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

/**
 * 会话行。清单视图与日历的当天面板共用一份：
 * 同一场会话在两个视图里长得不一样，用户会以为看到的是两条记录。
 */
export function SessionRow({ session: s, showPaths, allProjectPaths, onToast }: SessionRowProps) {
  return (
    <div className="desk-session-row">
      <span className="desk-row-time" title="会话起止时间">
        <Clock size={12} className="desk-time-ico" />
        {formatTimeRange(s.start, s.end)}
      </span>

      <span className="desk-row-tool">
        <ToolMark tool={s.tool} name={s.toolName} color={s.toolColor} size={15} />
      </span>

      <span className="desk-row-main">
        <span className="desk-row-title" title={`会话首条指令：${s.title}`}>
          {s.title || '（空白会话标题）'}
        </span>
        <span className="desk-row-meta">
          {showPaths && (
            <span
              className="desk-meta-proj"
              onClick={(e) => {
                e.stopPropagation()
                if (s.projectPath) void openLocalWithToast(onToast, s.projectPath)
              }}
              title={`在工作目录中打开：${s.projectPath}`}
            >
              {projectDisplayName(s.projectPath || s.project, allProjectPaths)}
            </span>
          )}
          {s.model && <span className="desk-meta-model">{s.model}</span>}
          <span className="desk-meta-turns">{s.turns} 轮</span>
          {s.artifacts.length > 0 && (
            <span className="desk-meta-art-count">产出 {s.artifacts.length} 个文件</span>
          )}
        </span>
      </span>
    </div>
  )
}
