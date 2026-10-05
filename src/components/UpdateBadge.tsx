import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { classNames } from '../lib/utils'
import { InstallConfirmDialog, useUpdateActions } from './UpdatePanel'

interface UpdateBadgeProps {
  onNavigate: (view: 'settings') => void
}

/**
 * 常驻更新提示条：固定右下角，仅在有可用更新时出现。
 * 与设置页共用 useUpdateActions，两处按钮行为与文案保持一致。
 */
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
  const ring = 26
  const circumference = 2 * Math.PI * (ring / 2 - 3)

  return (
    <>
      <div
        className="desk-update-float"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover && (update?.notes || update?.message) && (
          <div className="desk-update-pop" role="tooltip">
            <strong>版本 {actions.version} 更新内容</strong>
            <div className="desk-update-pop-body">
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
            'desk-update-float-btn',
            state === 'downloaded' && 'is-ready',
            actions.installing && 'is-busy',
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
            <svg className="desk-update-ring" viewBox={`0 0 ${ring} ${ring}`} aria-hidden>
              <circle
                className="desk-update-ring-track"
                cx={ring / 2}
                cy={ring / 2}
                r={ring / 2 - 3}
              />
              <circle
                className="desk-update-ring-bar"
                cx={ring / 2}
                cy={ring / 2}
                r={ring / 2 - 3}
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - percent / 100)}
              />
            </svg>
          )}
          {state === 'downloaded' && <ArrowUpRight size={14} />}
          <span>
            {state === 'available' && `新版本 v${actions.version} · 点击下载`}
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
