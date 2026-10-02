// 图标尺寸阶：全项目只允许这四档，避免出现 15/17/19 这类一次性取值。
// 用法：<Search size={ICON_SIZE.sm} />
export const ICON_SIZE = {
  /** 内联小图标：标签、计数、快捷键提示 */
  xs: 14,
  /** 常规：按钮、导航、行内操作 */
  sm: 16,
  /** 强调：侧栏导航、卡片操作 */
  md: 18,
  /** 大图标：空状态、页面级动作 */
  lg: 20,
} as const

/** 交互控件高度阶：点击区不小于 32px */
export const CONTROL_HEIGHT = {
  sm: 32,
  md: 36,
  lg: 40,
} as const

export type IconSize = (typeof ICON_SIZE)[keyof typeof ICON_SIZE]
export type ControlHeight = (typeof CONTROL_HEIGHT)[keyof typeof CONTROL_HEIGHT]
