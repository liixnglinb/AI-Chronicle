import { ExternalLink, FileSearch, X } from 'lucide-react'
import { artifacts } from '../data/mockData'
import { openLocalPath } from '../lib/desktop'
import { formatTimeFromMinute } from '../lib/utils'
import type { ActivityBlock, Workstream } from '../types'
import { ConfidenceBadge, ToolStack } from './StatusBadges'

interface EvidencePanelProps {
  workstream?: Workstream
  block?: ActivityBlock
  onClose?: () => void
  onNotify?: (title: string, message: string) => void
}

export function EvidencePanel({
  workstream,
  block,
  onClose,
  onNotify,
}: EvidencePanelProps) {
  const linkedArtifacts = workstream
    ? artifacts.filter((artifact) => workstream.artifactIds.includes(artifact.id))
    : artifacts.filter((artifact) =>
        block ? artifact.toolIds.includes(block.toolId) : false,
      )

  return (
    <aside className="evidence-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">证据检查器</span>
          <h3>{workstream?.title ?? block?.title ?? '选择一条记录'}</h3>
        </div>
        {onClose && (
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            title="关闭证据面板"
            aria-label="关闭证据面板"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {workstream ? (
        <>
          <div className="evidence-summary">
            <div className="evidence-meta-row">
              <ConfidenceBadge confidence={workstream.confidence} />
              <ToolStack toolIds={workstream.toolIds} />
            </div>
            <p>{workstream.summary}</p>
          </div>

          <div className="evidence-section">
            <div className="section-title-row">
              <span>来源证据</span>
              <small>{workstream.evidence.length} 条</small>
            </div>
            <div className="evidence-list">
              {workstream.evidence.map((item) => (
                <button
                  className="evidence-item"
                  type="button"
                  key={item.id}
                  onClick={() =>
                    onNotify?.(
                      item.label,
                      `来源文件：${item.source}。当前记录时间 ${item.time}。`,
                    )
                  }
                >
                  <span className="evidence-icon">
                    <FileSearch size={15} />
                  </span>
                  <span className="evidence-copy">
                    <strong>
                      {item.label}
                      <small>{item.time}</small>
                    </strong>
                    <span>{item.detail}</span>
                    <code>{item.source}</code>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="evidence-section">
            <div className="section-title-row">
              <span>关联产出</span>
              <small>{linkedArtifacts.length} 个</small>
            </div>
            <div className="linked-artifact-list">
              {linkedArtifacts.map((artifact) => {
                const Icon = artifact.icon
                return (
                  <button
                    type="button"
                    className="linked-artifact"
                    key={artifact.id}
                    onClick={async () => {
                      const result = await openLocalPath(artifact.path)
                      onNotify?.(
                        result.ok ? '已处理成果路径' : '无法打开成果',
                        result.message ??
                          `已请求打开 ${artifact.name}，请在系统窗口中查看。`,
                      )
                    }}
                  >
                    <span className="artifact-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{artifact.name}</strong>
                      <small>
                        {artifact.modifiedAt} · {artifact.size}
                      </small>
                    </span>
                    <ExternalLink size={14} />
                  </button>
                )
              })}
            </div>
          </div>
        </>
      ) : block ? (
        <>
          <div className="evidence-summary">
            <div className="evidence-meta-row">
              <ConfidenceBadge confidence={block.confidence} />
              <span className="mono-text">
                {formatTimeFromMinute(block.startMinute)} -{' '}
                {formatTimeFromMinute(block.endMinute)}
              </span>
            </div>
            <p>{block.detail}</p>
          </div>
          <div className="evidence-section">
            <div className="section-title-row">
              <span>会话信息</span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>会话编号</dt>
                <dd>{block.sessionId}</dd>
              </div>
              <div>
                <dt>项目</dt>
                <dd>{block.project}</dd>
              </div>
              <div>
                <dt>持续时间</dt>
                <dd>{block.endMinute - block.startMinute} 分钟</dd>
              </div>
            </dl>
          </div>
        </>
      ) : (
        <div className="inspector-empty">
          <FileSearch size={28} />
          <strong>选择一段活动</strong>
          <span>这里将展示会话证据、工具调用和关联产出。</span>
        </div>
      )}
    </aside>
  )
}
