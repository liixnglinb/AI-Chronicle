import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { classNames } from '../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 左侧图标；loading 时会被转圈替换 */
  icon?: ReactNode
  /** 加载态：显示转圈、禁用交互并标记 aria-busy，避免「点了没反应」 */
  loading?: boolean
  /** 正方形图标按钮 */
  square?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  square = false,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={classNames(
        'btn',
        `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        square && 'btn-square',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="btn-spinner" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 无障碍名称，同时作为 title 提示 */
  label: string
  size?: 'sm' | 'md'
  children: ReactNode
}

export function IconButton({
  label,
  size = 'md',
  className,
  children,
  type,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={classNames('icon-button', size === 'sm' && 'icon-button-sm', className)}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}
