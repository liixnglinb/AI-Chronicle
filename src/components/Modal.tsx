import { useRef, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { classNames } from '../lib/utils'
import { useFocusTrap } from '../lib/useFocusTrap'
import { ICON_SIZE } from '../lib/ui'
import { Button } from './Button'

export type ModalTone = 'default' | 'danger' | 'warning'

interface ModalProps {
  title: string
  children: ReactNode
  footer?: ReactNode
  icon?: ReactNode
  tone?: ModalTone
  onClose: () => void
}

/** 通用弹窗：遮罩 + 焦点陷阱 + Esc 关闭 + 关闭后焦点归还 */
export function Modal({ title, children, footer, icon, tone = 'default', onClose }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, true, onClose)

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        // 只有点在遮罩本身（不是卡片内部）才关闭
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-header">
          <span
            className={classNames(
              'modal-icon',
              tone === 'danger' && 'modal-icon-danger',
              tone === 'warning' && 'modal-icon-warning',
            )}
          >
            {icon ?? <TriangleAlert size={ICON_SIZE.md} />}
          </span>
          <div className="modal-heading">
            <h2 className="modal-title">{title}</h2>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  /** 一句话说明这次操作会做什么 */
  description: string
  /** 具体影响，逐条列出，让用户知道代价 */
  details?: string[]
  confirmLabel?: string
  cancelLabel?: string
  tone?: ModalTone
  /** 确认按钮是否处于加载态 */
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 危险操作二次确认。
 * 危险按钮放在右侧（主操作位）但用 danger 配色，取消放在其左侧，
 * 且默认焦点落在「取消」上——避免用户连按回车误触。
 */
export function ConfirmDialog({
  title,
  description,
  details,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, true, () => {
    if (!loading) onCancel()
  })

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (!loading && event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="modal"
        ref={cardRef}
        role="alertdialog"
        aria-busy={loading}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-header">
          <span
            className={classNames(
              'modal-icon',
              tone === 'danger' && 'modal-icon-danger',
              tone === 'warning' && 'modal-icon-warning',
            )}
          >
            <TriangleAlert size={ICON_SIZE.md} />
          </span>
          <div className="modal-heading">
            <h2 className="modal-title">{title}</h2>
          </div>
        </div>
        <div className="modal-body">
          <p>{description}</p>
          {details && details.length > 0 ? (
            <ul>
              {details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="modal-footer">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
