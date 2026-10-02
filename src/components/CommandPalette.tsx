import { useEffect, useMemo, useRef, useState } from 'react'
import { Moon, RefreshCw, Search, X } from 'lucide-react'
import { navItems } from '../data/nav'
import { useChronicle } from '../lib/store'
import { useFocusTrap } from '../lib/useFocusTrap'
import { dayKeyOf, formatTimeRange } from '../lib/format'
import type { ToastMessage, ViewId } from '../types'
import { ICON_SIZE } from '../lib/ui'

interface CommandPaletteProps {
  onClose: () => void
  onNavigate: (view: ViewId) => void
  onThemeToggle: () => void
  onAction: (toast: Omit<ToastMessage, 'id'>) => void
}

interface PaletteItem {
  key: string
  label: string
  hint: string
  /** 结果行左侧的图标位：命令用图标，会话用软件色点 */
  icon?: React.ReactNode
  run: () => void
}

export function CommandPalette({
  onClose,
  onNavigate,
  onThemeToggle,
  onAction,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const paletteRef = useRef<HTMLDivElement>(null)
  const { data, refresh, isDesktop } = useChronicle()

  // 焦点陷阱：Tab 不会跑到遮罩后的页面，Esc 关闭后焦点归还给触发按钮
  useFocusTrap(paletteRef, true, onClose)

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = navItems.map((item) => ({
      key: `nav-${item.id}`,
      label: `前往 ${item.label}`,
      hint: item.description,
      icon: <item.icon size={ICON_SIZE.xs} />,
      run: () => onNavigate(item.id),
    }))
    list.push({
      key: 'theme',
      label: '切换深浅主题',
      hint: '外观',
      icon: <Moon size={ICON_SIZE.xs} />,
      run: onThemeToggle,
    })
    if (isDesktop) {
      list.push({
        key: 'refresh',
        label: '重新采集数据',
        hint: '重新扫描全部接入来源',
        icon: <RefreshCw size={ICON_SIZE.xs} />,
        run: () => {
          void refresh(true).then(() =>
            onAction({
              tone: 'success',
              title: '已重新采集',
              message: '全部接入来源已按最新文件重新解析。',
            }),
          )
        },
      })
    }
    // 会话搜索
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      const matches = (data?.sessions ?? [])
        .filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.project.toLowerCase().includes(q) ||
            s.toolName.toLowerCase().includes(q) ||
            (s.artifacts ?? []).some((artifact) => artifact.name.toLowerCase().includes(q)),
        )
        .sort((a, b) => (b.start || 0) - (a.start || 0))
        .slice(0, 6)
      for (const s of matches) {
        const today = dayKeyOf(Date.now()) === dayKeyOf(s.start || 0)
        list.push({
          key: `session-${s.id}`,
          label: s.title,
          hint: `${s.toolName} · ${s.project} · ${
            today
              ? formatTimeRange(s.start, s.end)
              : new Date(s.start || 0).toLocaleDateString('zh-CN')
          }`,
          icon: <span className="tool-dot" style={{ ['--tool-color' as string]: s.toolColor }} />,
          run: () => onNavigate(today ? 'today' : 'history'),
        })
      }
    }
    return list
  }, [query, data, onNavigate, onThemeToggle, onAction, refresh, isDesktop])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Esc 由 useFocusTrap 统一处理
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((v) => Math.min(v + 1, items.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((v) => Math.max(v - 1, 0))
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = items[active]
        if (item) {
          item.run()
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, active, onClose])

  return (
    <div className="command-overlay" onClick={onClose}>
      <div
        className="command-palette"
        ref={paletteRef}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-input-row">
          <Search size={ICON_SIZE.sm} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话、项目、文件或执行命令…"
            aria-label="搜索会话、项目、文件或执行命令"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-autocomplete="list"
            aria-activedescendant={items[active] ? `command-option-${active}` : undefined}
          />
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭命令面板">
            <X size={ICON_SIZE.sm} />
          </button>
        </div>
        <div className="command-results" id="command-results" role="listbox" aria-label="命令结果">
          {items.map((item, index) => (
            <button
              key={item.key}
              id={`command-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              className={
                index === active ? 'command-result command-result-active' : 'command-result'
              }
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                item.run()
                onClose()
              }}
            >
              <span className="command-result-icon">{item.icon}</span>
              <span className="command-result-copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
          {items.length === 0 && <div className="command-empty">没有匹配的结果</div>}
        </div>
        <div className="command-footer">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
