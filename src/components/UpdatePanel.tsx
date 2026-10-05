import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useChronicle } from '../lib/store'
import { Button } from './Button'
import { ConfirmDialog } from './Modal'
import { Switch } from './Switch'
import type { ToastMessage } from '../types'

/**
 * 安装确认弹窗。
 *
 * 抽成独立组件是因为「安装并重启」有两个入口（设置页与常驻更新框），
 * 两处必须用同一份文案与同一套确认逻辑，否则用户会在不同地方看到不同的提示。
 */
export function InstallConfirmDialog({
  version,
  loading,
  onConfirm,
  onCancel,
}: {
  version: string
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      title="安装更新并重启？"
      description={`新版本 v${version} 已下载完成，安装需要退出并重新启动应用。`}
      impacts={[
        '安装过程会自动完成，重启后即进入新版本',
        '未保存的内容会随退出丢失，请先确认没有正在进行的导出',
        '也可以稍后再装：更新包已就绪，随时可回来点击安装',
      ]}
      confirmText="安装并重启"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

/** 更新相关动作：设置页与常驻更新框共用，保证按钮行为一致 */
export function useUpdateActions(onToast?: (toast: Omit<ToastMessage, 'id'>) => void) {
  const { update, isDesktop } = useChronicle()
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [confirmInstall, setConfirmInstall] = useState(false)

  const version = update?.version ?? ''
  const state = update?.state ?? 'idle'
  const disabled = !isDesktop || state === 'unavailable'

  async function checkUpdate() {
    if (!window.desktopAPI || disabled) return
    setChecking(true)
    try {
      const result = await window.desktopAPI.checkForUpdates()
      onToast?.({
        tone: result.state === 'available' ? 'info' : result.ok ? 'success' : 'warning',
        title:
          result.state === 'available'
            ? `发现新版本 v${result.version}`
            : result.state === 'not-available'
              ? '已是最新版本'
              : '更新检查完成',
        message: result.message ?? '',
      })
    } finally {
      setChecking(false)
    }
  }

  /** 手动开始下载：IPC 在下载完成时才回包，过程中的百分比由事件推送 */
  async function startDownload() {
    if (!window.desktopAPI || state !== 'available') return
    setDownloading(true)
    try {
      const result = await window.desktopAPI.downloadUpdate()
      onToast?.({
        tone: result.ok ? 'success' : 'warning',
        title: result.ok ? `v${version} 下载完成` : '下载未能启动',
        message: result.message ?? '',
      })
    } finally {
      setDownloading(false)
    }
  }

  async function setAutoDownload(enabled: boolean) {
    await window.desktopAPI?.setUpdateAutoDownload(enabled)
    onToast?.({
      tone: 'info',
      title: enabled ? '已开启自动下载' : '已关闭自动下载',
      message: enabled
        ? '发现新版本后直接取安装包（约 110 MB）。'
        : '发现新版本后要点「下载更新包」才开始取包。',
    })
  }

  function requestInstall() {
    if (state !== 'downloaded') return
    setConfirmInstall(true)
  }

  async function runInstall() {
    setInstalling(true)
    try {
      const result = await window.desktopAPI?.installUpdate()
      if (result && !result.ok && !result.canceled) {
        onToast?.({
          tone: 'warning',
          title: '安装未完成',
          message: result.message ?? '',
        })
      }
      setConfirmInstall(false)
    } finally {
      setInstalling(false)
    }
  }

  async function skipVersion() {
    if (!version) return
    await window.desktopAPI?.setSkippedUpdate(version)
    onToast?.({
      tone: 'info',
      title: `已跳过 v${version}`,
      message: '本次启动不再提示该版本，可随时在下方恢复。',
    })
  }

  async function restoreVersion() {
    await window.desktopAPI?.setSkippedUpdate(null)
    onToast?.({ tone: 'info', title: '已恢复更新提示', message: '下次检查会重新提示新版本。' })
  }

  function openDownloadPage() {
    void window.desktopAPI?.openUpdatePage()
  }

  return {
    state,
    version,
    disabled,
    checking,
    downloading,
    installing,
    confirmInstall,
    setConfirmInstall,
    checkUpdate,
    startDownload,
    setAutoDownload,
    requestInstall,
    runInstall,
    skipVersion,
    restoreVersion,
    openDownloadPage,
  }
}

/**
 * 设置页的「软件更新」分区内容。
 * 覆盖全部状态：未检查 / 检查中 / 有新版 / 下载中 / 已就绪 / 已是最新 / 已跳过 / 出错 / 开发模式。
 */
export function UpdatePanel({ onToast }: { onToast: (toast: Omit<ToastMessage, 'id'>) => void }) {
  const { update, isDesktop } = useChronicle()
  const actions = useUpdateActions(onToast)
  const percent = Math.min(100, Math.max(0, update?.percent ?? 0))
  const { state } = actions

  return (
    <div className="desk-update-panel">
      <div className="desk-update-main">
        <div className="desk-update-status">
          <strong>
            {state === 'idle' && '尚未检查'}
            {state === 'unavailable' && '开发模式不检查更新'}
            {state === 'checking' && '正在检查…'}
            {state === 'available' && `v${actions.version} 可更新`}
            {state === 'downloading' && `正在下载 v${actions.version}`}
            {state === 'downloaded' && `v${actions.version} 已就绪`}
            {state === 'not-available' &&
              (update?.skippedVersion ? `已跳过 v${update.skippedVersion}` : '已是最新版本')}
            {state === 'error' && '更新失败'}
          </strong>
          <small>{update?.message || '点按「检查更新」自动测速 GitHub 直连与镜像。'}</small>
          {update?.source && <small>当前下载源：{update.source}</small>}
          {update?.probes && update.probes.length > 0 && (
            <small>
              测速：
              {update.probes
                .map((probe) => `${probe.label} ${probe.ok ? `${probe.ms}ms` : '不可达'}`)
                .join(' · ')}
            </small>
          )}

          {state === 'downloading' && (
            <div className="desk-progress-wrap">
              <div
                className="desk-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                aria-label={`下载 v${actions.version}`}
              >
                <div className="desk-progress-bar" style={{ width: `${percent}%` }} />
              </div>
              <small>{percent}%</small>
            </div>
          )}

          {update?.notes && (
            <div className="desk-update-notes">
              {update.notes
                .split('\n')
                .filter(Boolean)
                .slice(0, 8)
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>
          )}
        </div>

        <div className="desk-update-actions">
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} />}
            loading={actions.checking}
            disabled={actions.disabled || state === 'downloading'}
            onClick={() => void actions.checkUpdate()}
          >
            检查更新
          </Button>

          {state === 'available' && (
            <Button
              variant="primary"
              loading={actions.downloading}
              disabled={actions.disabled}
              onClick={() => void actions.startDownload()}
            >
              下载更新包
            </Button>
          )}

          {state === 'downloaded' && (
            <Button variant="primary" onClick={actions.requestInstall}>
              安装并重启
            </Button>
          )}

          {(state === 'available' || state === 'downloading') && actions.version && (
            <Button variant="ghost" onClick={() => void actions.skipVersion()}>
              跳过 v{actions.version}
            </Button>
          )}

          {update?.skippedVersion && (
            <Button variant="ghost" onClick={() => void actions.restoreVersion()}>
              恢复更新提示
            </Button>
          )}

          {state === 'error' && (
            <>
              <Button variant="secondary" onClick={() => void actions.checkUpdate()}>
                重试
              </Button>
              <Button variant="secondary" onClick={actions.openDownloadPage}>
                前往下载页
              </Button>
            </>
          )}
        </div>
      </div>

      {isDesktop && (
        <div className="desk-update-auto">
          <Switch
            label="自动下载更新包"
            checked={!!update?.autoDownload}
            onChange={(checked) => void actions.setAutoDownload(checked)}
          />
          <span>打开后发现新版本即自动取安装包（约 110 MB）；关闭时需要手动点「下载更新包」</span>
        </div>
      )}

      {actions.confirmInstall && (
        <InstallConfirmDialog
          version={actions.version}
          loading={actions.installing}
          onConfirm={() => void actions.runInstall()}
          onCancel={() => actions.setConfirmInstall(false)}
        />
      )}
    </div>
  )
}
