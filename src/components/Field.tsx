import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { classNames } from '../lib/utils'

interface FieldProps {
  label?: ReactNode
  /** 补充说明；有 error 时自动隐藏，避免两行提示互相矛盾 */
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  className?: string
  children: ReactNode
}

/** 表单项容器：统一 label / 说明 / 错误三行的排版与间距 */
export function Field({ label, hint, error, htmlFor, className, children }: FieldProps) {
  return (
    <div className={classNames('field', className)}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function Input({ className, invalid = false, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={classNames('input', className)}
      aria-invalid={invalid || undefined}
    />
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select {...rest} className={classNames('select', className)}>
      {children}
    </select>
  )
}
