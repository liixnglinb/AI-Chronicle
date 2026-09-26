import { ToolDot } from './ToolDot'
import { formatTimeRange, totalTokens, formatTokens } from '../lib/format'
import type { SessionRecord } from '../types'

interface SessionRowProps {
  session: SessionRecord
  compact?: boolean
}

export function SessionRow({ session, compact = false }: SessionRowProps) {
  const tokens = totalTokens(session)
  return (
    <div className={compact ? 'session-row session-row-compact' : 'session-row'}>
      <div className="session-row-time">
        {formatTimeRange(session.start, session.end)}
      </div>
      <div className="session-row-body">
        <div className="session-row-title">
          <ToolDot color={session.toolColor} name={session.toolName} />
          <span className="session-title-text">{session.title}</span>
        </div>
        <div className="session-row-meta">
          <span className="session-project">{session.project}</span>
          {session.turns > 0 && <span>{session.turns} 轮</span>}
          {tokens > 0 && <span>{formatTokens(tokens)} tokens</span>}
          {session.model && <span className="session-model">{session.model}</span>}
        </div>
      </div>
    </div>
  )
}
