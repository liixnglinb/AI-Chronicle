import { useEffect, useMemo, useState } from 'react'
import { Moon, RefreshCw, Search, X } from 'lucide-react'
import { navItems } from '../data/nav'
import { useChronicle } from '../lib/store'
import { dayKeyOf, formatTimeRange } from '../lib/format'
import type { ToastMessage, ViewId } from '../types'

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
  const { data, refresh, isDesktop } = useChronicle()

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = navItems.map((item) => ({
      key: `nav-${item.id}`,
      label: `前往 ${item.label}`,
      hint: item.description,
      run: () => onNavigate(item.id),
    }))
    list.push({
      key: 'theme',
      label: '切换深浅主题',
      hint: '外观',
      run: onThemeToggle,
    })
    if (isDesktop) {
      list.push({
        key: 'refresh',
        label: '重新采集数据',
        hint: '重新扫描全部数据源',
        run: () => {
          void refresh(true).then(() =>
            onAction({
              tone: 'success',
              title: '已重新采集',
              message: '全部数据源已按最新文件重新解析。',
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
            s.toolName.toLowerCase().includes(q),
        )
        .sort((a, b) => (b.start || 0) - (a.start || 0))
        .slice(0, 6)
      for (const s of matches) {
        const today = dayKeyOf(Date.now()) === dayKeyOf(s.start || 0)
        list.push({
          key: `session-${s.id}`,
          label: s.title,
          hint: `${s.toolName} · ${s.project} · ${today ? formatTimeRange(s.start, s.end) : new Date(s.start || 0).toLocaleDateString('zh-CN')}`,
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
      if (event.key === 'Escape') onClose()
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
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-input-row">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话或执行命令…"
            aria-label="命令面板"
          />
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="command-results">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className={
                index === active ? 'command-result command-result-active' : 'command-result'
              }
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                item.run()
                onClose()
              }}
            >
              <span className="command-result-icon">
                {item.key === 'theme' ? (
                  <Moon size={14} />
                ) : item.key === 'refresh' ? (
                  <RefreshCw size={14} />
                ) : null}
              </span>
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
