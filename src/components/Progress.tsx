import { classNames } from '../lib/utils'
import { Button } from './Button'
import { ICON_SIZE } from '../lib/ui'
import { ChevronDown } from 'lucide-react'

interface ProgressProps {
  /** 当前值，0–100 */
  value: number
  label?: string
  className?: string
}

/** 进度条：用于下载进度等确定性进度展示 */
export function Progress({ value, label, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      className={classNames('progress', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div className="progress-bar" style={{ width: `${clamped}%` }} />
    </div>
  )
}

interface LoadMoreProps {
  /** 还有多少条未渲染 */
  remaining: number
  onClick: () => void
  /** 名词，例如「项目」「文件」 */
  noun: string
  loading?: boolean
}

/** 长列表分页：统一的「显示更多」入口，替代各页自己拼的按钮 */
export function LoadMore({ remaining, onClick, noun, loading = false }: LoadMoreProps) {
  if (remaining <= 0) return null
  return (
    <div className="load-more">
      <Button
        variant="secondary"
        icon={<ChevronDown size={ICON_SIZE.sm} />}
        loading={loading}
        onClick={onClick}
      >
        显示更多{noun}（还有 {remaining} 个）
      </Button>
    </div>
  )
}
