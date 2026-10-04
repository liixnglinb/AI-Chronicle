import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Copy, RefreshCw, TriangleAlert } from 'lucide-react'
import { reportError } from '../lib/errors'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  detail: string
  copied: boolean
}

/**
 * 渲染异常兜底。任何页面组件抛错都会被这里接住，
 * 展示可恢复的界面而不是整页白屏；错误详情会上报到本机日志。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, detail: '', copied: false }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const detail = [`${error.name}: ${error.message}`, error.stack ?? '', info.componentStack ?? '']
      .filter(Boolean)
      .join('\n')
    console.error('[AI 轨迹] 渲染异常', error, info)
    reportError({ scope: 'render', message: error.message || error.name, stack: detail })
    this.setState({ detail })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleCopy = async () => {
    const text = this.state.detail || this.state.error?.message || '未知错误'
    try {
      await navigator.clipboard.writeText(text)
      this.setState({ copied: true })
      window.setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // 剪贴板不可用时保留原文，用户可手动选中复制
    }
  }

  render() {
    const { error, detail, copied } = this.state
    if (!error) return this.props.children

    return (
      <div className="desk-error-boundary" role="alert">
        <div className="desk-error-card">
          <span className="desk-error-icon">
            <TriangleAlert size={20} />
          </span>
          <h1>界面出现异常</h1>
          <p>错误已被拦截，本机数据没有受到影响。可以重新加载界面，或复制错误详情用于排查。</p>
          <pre className="desk-error-detail">{detail || error.message}</pre>
          <div className="desk-error-actions">
            <button className="desk-btn-primary" type="button" onClick={this.handleReload}>
              <RefreshCw size={14} />
              重新加载
            </button>
            <button
              className="desk-btn-secondary"
              type="button"
              onClick={() => void this.handleCopy()}
            >
              <Copy size={14} />
              {copied ? '已复制' : '复制错误详情'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
