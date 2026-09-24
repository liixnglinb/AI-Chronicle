import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import type { ToastMessage } from '../types'

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  const icons = {
    success: CheckCircle2,
    info: Info,
    warning: TriangleAlert,
  }

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = icons[toast.tone]
        return (
          <div className={`toast toast-${toast.tone}`} key={toast.id}>
            <span className="toast-icon">
              <Icon size={17} />
            </span>
            <span className="toast-copy">
              <strong>{toast.title}</strong>
              <span>{toast.message}</span>
            </span>
            <button
              className="icon-button"
              type="button"
              onClick={() => onDismiss(toast.id)}
              title="关闭通知"
              aria-label="关闭通知"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
