import { classNames } from '../lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** 无障碍名称；视觉上由外部的 desk-set-copy 承担说明 */
  label: string
  disabled?: boolean
}

/** 开关控件：用于布尔型设置项 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={classNames('desk-switch')}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="desk-switch-thumb" />
    </button>
  )
}
