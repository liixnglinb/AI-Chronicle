import { useState } from 'react'
import { useChronicle } from '../lib/store'
import { classNames } from '../lib/utils'

interface UpdateBadgeProps {
  onNavigate: (view: 'settings') => void
}

// 常驻更新小框（合规要求）：固定右下角、无箭头图标、圆形进度环、
// 悬停显示更新内容，下载完成后点击 → 弹「是否现在更新并重启」确认
export function UpdateBadge({ onNavigate }: UpdateBadgeProps) {
  const { update, isDesktop } = useChronicle()
  const [hover, setHover] = useState(false)
  const [installing, setInstalling] = useState(false)

  if (!isDesktop) return null
  const state = update?.state
  if (state !== 'available' && state !== 'downloading' && state !== 'downloaded') {
    return null
  }

  const version = update?.version ?? ''
  const percent = Math.min(100, Math.max(0, update?.percent ?? 0))

  async function handleClick() {
    if (state === 'downloaded' && !installing) {
      setInstalling(true)
      try {
        const result = await window.desktopAPI?.installUpdate()
        // 主进程已弹确认框；取消或失败时恢复可点状态
        if (!result?.ok) setInstalling(false)
      } catch {
        setInstalling(false)
      }
    } else if (state === 'available') {
      onNavigate('settings')
    }
  }

  const ring = Math.max(4, 30)
  const circumference = 2 * Math.PI * (ring / 2 - 3)

  return (
    <div
      className="update-badge-wrap"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (update?.notes || update?.message) && (
        <div className="update-pop" role="tooltip">
          <strong>版本 {version} 更新内容</strong>
          <div className="update-pop-body">
            {update?.notes
              ? update.notes.split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))
              : update?.message}
          </div>
          {update?.source && <small>下载源：{update.source}</small>}
        </div>
      )}
      <button
        type="button"
        className={classNames(
          'update-badge',
          state === 'downloaded' && 'update-badge-ready',
          installing && 'update-badge-busy',
        )}
        onClick={() => void handleClick()}
      >
        {state === 'downloading' && (
          <svg className="update-ring" viewBox={`0 0 ${ring} ${ring}`} aria-hidden>
            <circle className="update-ring-track" cx={ring / 2} cy={ring / 2} r={ring / 2 - 3} />
            <circle
              className="update-ring-bar"
              cx={ring / 2}
              cy={ring / 2}
              r={ring / 2 - 3}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percent / 100)}
            />
          </svg>
        )}
        <span className="update-badge-text">
          {state === 'available' && `新版本 v${version} · 正在后台下载`}
          {state === 'downloading' && `下载中 ${percent}%`}
          {state === 'downloaded' && (installing ? '等待确认…' : `v${version} 已就绪 · 点击更新并重启`)}
        </span>
      </button>
    </div>
  )
}
