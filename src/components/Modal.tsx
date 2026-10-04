import { useRef, type ReactNode } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { classNames } from '../lib/utils'
import { useFocusTrap } from '../lib/useFocusTrap'

interface ConfirmDialogProps {
  title: string
  /** 一句话说明这次操作会做什么 */
  description: string
  /** 具体影响，逐条列出，让用户知道代价 */
  impacts?: string[]
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 破坏性操作二次确认。
 * 默认焦点落在「取消」上（useFocusTrap 取容器内第一个可聚焦元素，
 * 取消按钮在 DOM 中先于确认按钮），避免连按回车误触。
 */
export function ConfirmDialog({
  title,
  description,
  impacts,
  confirmText = '确认执行',
  cancelText = '取消',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true, () => {
    if (!loading) onCancel()
  })

  return (
    <div
      className="desk-modal-backdrop"
      onMouseDown={(event) => {
        if (!loading && event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="desk-modal-box"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-busy={loading || undefined}
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="desk-modal-head">
          <div className="desk-modal-title-wrap">
            {danger && <TriangleAlert size={16} className="desk-modal-danger-ico" />}
            <h3 className="desk-modal-title">{title}</h3>
          </div>
          <button onClick={onCancel} className="desk-modal-close" aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        <div className="desk-modal-body">
          <p className="desk-modal-desc">{description}</p>
          {impacts && impacts.length > 0 && (
            <ul className="desk-modal-impacts">
              {impacts.map((impact, idx) => (
                <li key={idx}>{impact}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="desk-modal-foot">
          <button onClick={onCancel} className="desk-btn-secondary" disabled={loading} autoFocus>
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={danger ? 'desk-btn-danger' : 'desk-btn-primary'}
          >
            {loading ? '正在处理…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ModalProps {
  title: string
  children: ReactNode
  footer?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'danger' | 'warning'
  onClose: () => void
}

/** 通用弹窗：遮罩 + 焦点陷阱 + Esc 关闭 + 关闭后焦点归还 */
export function Modal({ title, children, footer, icon, tone = 'default', onClose }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(cardRef, true, onClose)

  return (
    <div
      className="desk-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={classNames('desk-modal-box')}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="desk-modal-head">
          <div className="desk-modal-title-wrap">
            {icon ??
              (tone !== 'default' ? (
                <TriangleAlert size={16} className="desk-modal-danger-ico" />
              ) : null)}
            <h3 className="desk-modal-title">{title}</h3>
          </div>
          <button onClick={onClose} className="desk-modal-close" aria-label="关闭">
            <X size={14} />
          </button>
        </div>
        <div className="desk-modal-body">{children}</div>
        {footer ? <div className="desk-modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}
