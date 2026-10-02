import { useState } from 'react'
import { useChronicle } from '../lib/store'
import { classNames } from '../lib/utils'
import { ArrowUpRight } from 'lucide-react'
import { ICON_SIZE } from '../lib/ui'
import { InstallConfirmDialog, useUpdateActions } from './UpdatePanel'

interface UpdateBadgeProps {
  onNavigate: (view: 'settings') => void
}

// 常驻更新小框：固定右下角、圆形进度环、悬停显示更新内容。
// 与设置页共用 useUpdateActions，两处按钮行为与文案保持一致。
export function UpdateBadge({ onNavigate }: UpdateBadgeProps) {
  const { update, isDesktop } = useChronicle()
  const [hover, setHover] = useState(false)
  const actions = useUpdateActions()

  if (!isDesktop) return null
  const { state } = actions
  if (state !== 'available' && state !== 'downloading' && state !== 'downloaded') {
    return null
  }

  const percent = Math.min(100, Math.max(0, update?.percent ?? 0))
  const ring = 30
  const circumference = 2 * Math.PI * (ring / 2 - 3)

  return (
    <>
      <div
        className="update-badge-wrap"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover && (update?.notes || update?.message) && (
          <div className="update-pop" role="tooltip">
            <strong>版本 {actions.version} 更新内容</strong>
            <div className="update-pop-body">
              {update?.notes
                ? update.notes
                    .split('\n')
                    .filter(Boolean)
                    .map((line, i) => <p key={i}>{line}</p>)
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
            actions.installing && 'update-badge-busy',
          )}
          aria-label={
            state === 'downloaded'
              ? `安装 v${actions.version} 并重启`
              : `新版本 v${actions.version}，前往设置查看`
          }
          onClick={() => {
            if (state === 'downloaded') actions.requestInstall()
            else onNavigate('settings')
          }}
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
          {state === 'downloaded' && <ArrowUpRight size={ICON_SIZE.sm} />}
          <span className="update-badge-text">
            {state === 'available' && `新版本 v${actions.version} · 后台下载中`}
            {state === 'downloading' && `下载中 ${percent}%`}
            {state === 'downloaded' && `v${actions.version} 已就绪 · 点击安装`}
          </span>
        </button>
      </div>

      {actions.confirmInstall && (
        <InstallConfirmDialog
          version={actions.version}
          loading={actions.installing}
          onConfirm={() => void actions.runInstall()}
          onCancel={() => actions.setConfirmInstall(false)}
        />
      )}
    </>
  )
}
