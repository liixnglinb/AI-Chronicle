import { AlertTriangle, CheckCircle2, CircleSlash, Radio } from 'lucide-react'
import { classNames } from '../lib/utils'
import type { SourceRecord } from '../types'

const PROTOCOL_LABEL: Record<string, string> = {
  jsonl: 'JSONL 逐行',
  sqlite: 'SQLite 只读',
  zstd: 'Zstd 压缩',
  none: '未适配',
}

interface SourceHealthBadgeProps {
  source: SourceRecord
  /** 显示协议特征，默认开启 */
  showProtocol?: boolean
}

/**
 * 数据源健康指示符。
 * 单一位置说清三件事：状态（正常/异常/观察中/未检测到）、协议特征、只读访问方式。
 * 不再用一块置灰卡片代替全部信息。
 */
export function SourceHealthBadge({ source, showProtocol = true }: SourceHealthBadgeProps) {
  const status = source.status
  const Icon =
    status === 'connected'
      ? CheckCircle2
      : status === 'error'
        ? AlertTriangle
        : status === 'observing'
          ? Radio
          : CircleSlash

  const tone =
    status === 'connected'
      ? 'ok'
      : status === 'error'
        ? 'bad'
        : status === 'observing'
          ? 'warn'
          : 'idle'

  const label =
    status === 'connected'
      ? '正常直连'
      : status === 'error'
        ? '解析异常'
        : status === 'observing'
          ? '已探测 · 待适配'
          : '未检测到'

  return (
    <span className={classNames('desk-src-tag', `is-${tone}`)}>
      <Icon size={11} />
      <span>{label}</span>
      {showProtocol && source.protocol && (
        <span className="desk-badge">
          {PROTOCOL_LABEL[source.protocol] ?? source.protocol}
          {source.access === 'read-only' ? ' · 只读' : ''}
        </span>
      )}
    </span>
  )
}
