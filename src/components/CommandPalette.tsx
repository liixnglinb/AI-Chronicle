import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Download, Moon, RefreshCw, Search, Sun, X } from 'lucide-react'
import { navItems } from '../data/nav'
import { useChronicle } from '../lib/store'
import { formatTimeRange } from '../lib/format'
import { matchSession } from '../lib/search'
import { useFocusTrap } from '../lib/useFocusTrap'
import { classNames } from '../lib/utils'
import { ToolMark } from './ToolMark'
import type { ToastMessage, ViewId } from '../types'

interface CommandPaletteProps {
  theme: 'light' | 'dark'
  onClose: () => void
  onNavigate: (view: ViewId, search?: string) => void
  onThemeToggle: () => void
  onAction: (toast: Omit<ToastMessage, 'id'>) => void
  /** 从今日工作台跳到「导出日报」等页面内动作 */
  onExportDaily: () => void
}

interface PaletteAction {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  run: () => void
}

/**
 * ⌘/Ctrl+K 命令面板。
 * 分为「功能指令」与「匹配会话」两区，↑↓ 穿透两区，Enter 执行，Esc 关闭。
 * 选中行自动 scrollIntoView，保证键盘导航时高亮始终在视口内。
 */
export function CommandPalette({
  theme,
  onClose,
  onNavigate,
  onThemeToggle,
  onAction,
  onExportDaily,
}: CommandPaletteProps) {
  const { data, refresh, settings } = useChronicle()
  const showPaths = settings.showProjectPaths
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useFocusTrap(containerRef, true, onClose)

  const allSessions = useMemo(() => data?.sessions ?? [], [data])

  // 1. 静态动作项：导航 + 视图内动作
  const staticActions = useMemo<PaletteAction[]>(() => {
    const navActions: PaletteAction[] = navItems.map((item) => ({
      id: `nav-${item.id}`,
      label: `跳转到 ${item.label}`,
      hint: item.description,
      icon: <item.icon size={14} />,
      run: () => onNavigate(item.id),
    }))

    const opActions: PaletteAction[] = [
      {
        id: 'op-refresh',
        label: '立即重新采集全量数据源',
        hint: '强制扫描本机全部 AI 软件归档',
        icon: <RefreshCw size={14} />,
        run: () => {
          void refresh(true).then((ok) => {
            if (!ok) return
            onAction({
              tone: 'success',
              title: '采集同步完毕',
              message: '已同步本机所有会话与产出',
            })
          })
        },
      },
      {
        id: 'op-theme',
        label: `切换到${theme === 'dark' ? '暖灰浅色' : '黑曜深色'}主题`,
        hint: '主题与窗口镶边实时联动',
        icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        run: onThemeToggle,
      },
      {
        id: 'op-report',
        label: '导出今日 Markdown 日报',
        hint: '把今日成果写成可归档文件',
        icon: <Download size={14} />,
        run: onExportDaily,
      },
    ]

    return [...navActions, ...opActions]
  }, [onNavigate, onThemeToggle, refresh, onAction, onExportDaily, theme])

  // 2. 复合意图检索：动作 + 会话双分区
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return { actions: staticActions.slice(0, 6), sessions: allSessions.slice(0, 5) }
    }
    return {
      actions: staticActions.filter(
        (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q),
      ),
      sessions: allSessions.filter((s) => matchSession(s, query)).slice(0, 20),
    }
  }, [query, staticActions, allSessions])

  const flattenedTotal = results.actions.length + results.sessions.length

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 滚动保证高亮项可见
  useEffect(() => {
    const active = listRef.current?.querySelector('.desk-cmd-item.selected')
    if (active) active.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  function runSelected() {
    if (selectedIndex < results.actions.length) {
      results.actions[selectedIndex].run()
      return
    }
    const session = results.sessions[selectedIndex - results.actions.length]
    if (session) {
      onNavigate('history', session.title)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev + 1 < flattenedTotal ? prev + 1 : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(flattenedTotal - 1, 0)))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runSelected()
    }
  }

  return (
    <div
      className="desk-cmd-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="desk-cmd-modal"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="desk-cmd-input-bar">
          <Search size={15} className="desk-cmd-search-ico" />
          <input
            type="text"
            placeholder="搜索命令、操作或跨工具历史会话…"
            aria-label="搜索命令、操作或跨软件历史会话"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="desk-cmd-input"
          />
          <button onClick={onClose} className="desk-cmd-close-btn" aria-label="关闭命令面板">
            <X size={14} />
          </button>
        </div>

        <div className="desk-cmd-scroll" ref={listRef} role="listbox" aria-label="命令结果">
          {results.actions.length > 0 && (
            <div className="desk-cmd-group">
              <span className="desk-cmd-group-label">功能指令</span>
              {results.actions.map((action, idx) => (
                <div
                  key={action.id}
                  id={`desk-cmd-option-${idx}`}
                  role="option"
                  aria-selected={selectedIndex === idx}
                  className={classNames('desk-cmd-item', selectedIndex === idx && 'selected')}
                  onClick={() => {
                    action.run()
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="desk-cmd-item-icon">{action.icon}</span>
                  <span className="desk-cmd-item-body">
                    <strong className="desk-cmd-item-label">{action.label}</strong>
                    <small className="desk-cmd-item-hint">{action.hint}</small>
                  </span>
                  {selectedIndex === idx && (
                    <CornerDownLeft size={12} className="desk-cmd-enter-ico" />
                  )}
                </div>
              ))}
            </div>
          )}

          {results.sessions.length > 0 && (
            <div className="desk-cmd-group">
              <span className="desk-cmd-group-label">匹配会话记录</span>
              {results.sessions.map((session, sIdx) => {
                const itemIndex = results.actions.length + sIdx
                return (
                  <div
                    key={session.id}
                    id={`desk-cmd-option-${itemIndex}`}
                    role="option"
                    aria-selected={selectedIndex === itemIndex}
                    className={classNames(
                      'desk-cmd-item',
                      selectedIndex === itemIndex && 'selected',
                    )}
                    onClick={() => {
                      onNavigate('history', session.title)
                      onClose()
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                  >
                    <span
                      className="desk-cmd-session-dot"
                      style={{ backgroundColor: session.toolColor }}
                    />
                    <span className="desk-cmd-item-body">
                      <strong className="desk-cmd-item-label" title={session.title}>
                        {session.title || '（未命名会话）'}
                      </strong>
                      <small className="desk-cmd-item-hint">
                        {/* 目录默认不进提示行；软件用品牌图标识（识别不了的那几款自动带名字） */}
                        {showPaths && `${session.project} · `}
                        <ToolMark
                          tool={session.tool}
                          name={session.toolName}
                          color={session.toolColor}
                          size={13}
                        />
                        {' · '}
                        {formatTimeRange(session.start, session.end)}
                      </small>
                    </span>
                    {selectedIndex === itemIndex && (
                      <CornerDownLeft size={12} className="desk-cmd-enter-ico" />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {flattenedTotal === 0 && (
            <div className="desk-cmd-empty">
              未检索到匹配项，可尝试搜索软件名称{showPaths ? '或工作目录' : '或会话标题'}
            </div>
          )}
        </div>

        <footer className="desk-cmd-footer">
          <div className="desk-cmd-shortcut-hints">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> 导航
            </span>
            <span>
              <kbd>Enter</kbd> 执行
            </span>
            <span>
              <kbd>Esc</kbd> 退出
            </span>
          </div>
          <span className="desk-cmd-count-hint">已聚合 {allSessions.length} 条会话</span>
        </footer>
      </div>
    </div>
  )
}
