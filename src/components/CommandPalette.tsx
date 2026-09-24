import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Command,
  FileSearch,
  FolderKanban,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { artifacts, navItems, projects, tools } from '../data/mockData'
import type { ToastMessage, ViewId } from '../types'
import { classNames } from '../lib/utils'

interface CommandPaletteProps {
  onClose: () => void
  onNavigate: (view: ViewId) => void
  onAction: (toast: Omit<ToastMessage, 'id'>) => void
}

export function CommandPalette({
  onClose,
  onNavigate,
  onAction,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const navMatches = navItems
      .filter((item) => item.label.toLowerCase().includes(normalized))
      .map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        hint: '页面',
        icon: item.icon,
        run: () => onNavigate(item.id),
      }))
    const toolMatches = tools
      .filter((tool) => tool.name.toLowerCase().includes(normalized))
      .slice(0, 3)
      .map((tool) => ({
        id: `tool-${tool.id}`,
        label: tool.name,
        hint: '数据源',
        icon: Sparkles,
        run: () => onNavigate('sources'),
      }))
    const projectMatches = projects
      .filter((project) => project.name.includes(query || '每日'))
      .slice(0, 3)
      .map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        hint: '项目',
        icon: FolderKanban,
        run: () => onNavigate('projects'),
      }))
    const artifactMatches = artifacts
      .filter((artifact) => artifact.name.toLowerCase().includes(normalized))
      .slice(0, 3)
      .map((artifact) => ({
        id: `artifact-${artifact.id}`,
        label: artifact.name,
        hint: '成果',
        icon: FileSearch,
        run: () => onNavigate('library'),
      }))
    const actionMatches =
      !normalized || '重新扫描'.includes(normalized)
        ? [
            {
              id: 'action-scan',
              label: '重新扫描今天的活动',
              hint: '操作',
              icon: Search,
              run: () =>
                onAction({
                  tone: 'info',
                  title: '已开始增量扫描',
                  message: '后台正在读取新增日志，预计数秒完成。',
                }),
            },
          ]
        : []

    return [...navMatches, ...actionMatches, ...projectMatches, ...toolMatches, ...artifactMatches]
  }, [onAction, onNavigate, query])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => Math.min(results.length - 1, index + 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => Math.max(0, index - 1))
      }
      if (event.key === 'Enter' && results[activeIndex]) {
        results[activeIndex].run()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, onClose, results])

  return (
    <div className="command-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-row">
          <Command size={18} />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder="搜索页面、项目、软件、成果或执行操作"
            aria-label="搜索命令"
          />
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="command-results">
          <span className="command-group-label">推荐</span>
          {results.length ? (
            results.slice(0, 9).map((item, index) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={classNames(
                    'command-result',
                    index === activeIndex && 'command-result-active',
                  )}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    item.run()
                    onClose()
                  }}
                >
                  <span className="command-result-icon">
                    <Icon size={16} />
                  </span>
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                  <ArrowRight size={14} />
                </button>
              )
            })
          ) : (
            <div className="command-empty">没有匹配结果</div>
          )}
        </div>
        <div className="command-footer">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </section>
    </div>
  )
}
