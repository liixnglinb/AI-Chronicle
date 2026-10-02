import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** 页头小标题：用于承载日期、统计口径等上下文信息 */
  kicker?: ReactNode
  /** 页面唯一主标题 */
  title: string
  /** 可选的补充说明，仅在有需要时使用 */
  description?: ReactNode
  /** 右侧操作区 */
  actions?: ReactNode
}

/**
 * 统一的页头。8 个页面共用，保证标题层级、间距与操作区对齐方式完全一致。
 * 注意：页面主标题只在页头出现一次，顶栏不再重复渲染。
 */
export function PageHeader({ kicker, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {kicker ? <span className="page-kicker">{kicker}</span> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}
