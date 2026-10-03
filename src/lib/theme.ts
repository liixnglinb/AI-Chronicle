// 主题初始化与持久化。
// 单独抽出是为了在 main.tsx 里也能预先应用主题——即使 App 渲染异常，
// 错误兜底界面也能拿到正确的深浅配色。
export type ThemeName = 'light' | 'dark'

const STORAGE_KEY = 'ai-chronicle-theme'

function isTheme(value: unknown): value is ThemeName {
  return value === 'light' || value === 'dark'
}

/** 优先级：URL 参数（截图自检 / 深链） > 本地存储 > 默认档。
 *  默认档固定为深色：v0.6.4 起暗色档是主打的黑曜石质感，
 *  浅色档保留为可选，不再跟随系统偏好自动切换。 */
export function getInitialTheme(): ThemeName {
  const param = new URLSearchParams(window.location.search).get('theme')
  if (isTheme(param)) return param

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用
  }

  return 'dark'
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 存储不可用时忽略，仅本次生效
  }
  // 同步 Windows 标题栏覆盖层颜色，避免浅色主题下顶部残留深色带
  void window.desktopAPI?.setWindowTheme(theme)
}
