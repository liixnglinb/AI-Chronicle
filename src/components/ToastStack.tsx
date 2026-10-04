import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import type { ToastMessage } from '../types'

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

const ICONS = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  info: Info,
} as const

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div className="desk-toast-stack" role="region" aria-label="操作反馈通知" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone]
        return (
          <div key={toast.id} className={`desk-toast-item ${toast.tone}`}>
            <span className="desk-toast-icon">
              <Icon size={15} />
            </span>
            <div className="desk-toast-body">
              <strong className="desk-toast-title">{toast.title}</strong>
              <span className="desk-toast-msg">{toast.message}</span>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="desk-toast-close"
              aria-label="关闭通知"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
