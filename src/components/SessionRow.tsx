import { ToolDot } from './ToolDot'
import { classNames } from '../lib/utils'
import { formatSessionTime } from '../lib/format'
import type { SessionRecord } from '../types'

interface SessionRowProps {
  session: SessionRecord
  compact?: boolean
}

export function SessionRow({ session, compact = false }: SessionRowProps) {
  const time = formatSessionTime(session.start, session.end)

  return (
    <div className={classNames('session-row', compact && 'session-row-compact', 'list-item-enter')}>
      <div className={time.unknown ? 'session-row-time session-row-unknown' : 'session-row-time'}>
        {time.text}
      </div>
      <div className="session-row-body">
        <div className="session-row-title">
          <ToolDot color={session.toolColor} name={session.toolName} />
          <span className="session-title-text" title={session.title}>
            {session.title}
          </span>
        </div>
        <div className="session-row-meta">
          <span className="session-project" title={session.project}>
            {session.project}
          </span>
          {session.turns > 0 && <span>{session.turns} 轮</span>}
          {session.model && (
            <span className="session-model" title={session.model}>
              {session.model}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
