import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Sparkles, Trash2 } from 'lucide-react'
import { callDesktop, type ToastPusher } from '../lib/main-call'
import { useChronicle } from '../lib/store'
import { formatClock } from '../lib/format'
import { classNames } from '../lib/utils'

interface DaySummaryPanelProps {
  dayKey: string
  onToast: ToastPusher
  onGoToSettings: () => void
}

type Phase = 'idle' | 'running' | 'error'

const SUMMARIZE_TIMEOUT_MS = 40_000
const PREVIEW_TIMEOUT_MS = 20_000

/**
 * 当天面板里的模型总结位。
 * 它永远排在本地事实之下、且明确标注由哪个模型在何时生成 —— 本地统计是可核对的事实，
 * 模型输出只是辅助，不能顶替前者。
 */
export function DaySummaryPanel({ dayKey, onToast, onGoToSettings }: DaySummaryPanelProps) {
  const { setBusyHint } = useChronicle()
  const [summaries, setSummaries] = useState<Record<string, DaySummary> | null>(null)
  const [config, setConfig] = useState<AiConfigState | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<DayPayloadPreview | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const inFlight = useRef<{ dayKey: string; requestId: string } | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!window.desktopAPI) return
    void (async () => {
      const [sum, cfg] = await Promise.all([
        callDesktop(onToast, '读取历史总结', () => window.desktopAPI!.getDaySummaries()),
        callDesktop(onToast, '读取模型配置', () => window.desktopAPI!.getAiConfig()),
      ])
      if (sum) setSummaries(sum.summaries)
      if (cfg) setConfig(cfg)
    })()
    // 只在挂载时拉一次；切日期不需要重读配置
  }, [onToast])

  // 换天时这个组件由父级用 key 重建（状态自然归零），这里只负责在卸载时断掉上一天的在途请求，
  // 避免 A 天的响应回来写进 B 天的面板。
  useEffect(
    () => () => {
      const pending = inFlight.current
      if (pending) {
        void window.desktopAPI?.cancelSummarize(pending.requestId)
        setBusyHint(null)
      }
    },
    [],
  )

  const active = summaries?.[dayKey] ?? null
  const channels = config?.channels ?? []

  const generate = useCallback(async () => {
    if (!window.desktopAPI) return
    seq.current += 1
    const requestId = `req_${Date.now()}_${seq.current}`
    inFlight.current = { dayKey, requestId }
    setPhase('running')
    setError('')
    setBusyHint('正在生成当日总结')
    const result = await callDesktop(
      onToast,
      '生成当日总结',
      () => window.desktopAPI!.summarizeDay({ dayKey, requestId }),
      SUMMARIZE_TIMEOUT_MS,
    )
    // 已经被新请求或切日期取代：这份响应直接丢弃
    if (inFlight.current?.requestId !== requestId) return
    inFlight.current = null
    setBusyHint(null)
    if (!result) {
      setPhase('error')
      setError('请求没有返回结果，可点「重试」再来一次。')
      return
    }
    if (!result.ok) {
      setPhase('error')
      setError(result.canceled ? '已取消。' : result.message || '模型没有返回内容。')
      return
    }
    setSummaries((prev) => ({ ...(prev || {}), [dayKey]: result.summary! }))
    setPhase('idle')
    if (!result.stored) {
      onToast({ tone: 'warning', title: '总结未落盘', message: result.message || '' })
    }
  }, [dayKey, onToast, setBusyHint])

  async function handlePreview() {
    if (!window.desktopAPI) return
    if (showPreview) {
      setShowPreview(false)
      return
    }
    if (preview?.ok) {
      setShowPreview(true)
      return
    }
    const result = await callDesktop(
      onToast,
      '生成发送内容预览',
      () => window.desktopAPI!.previewDayPayload(dayKey),
      PREVIEW_TIMEOUT_MS,
    )
    if (!result) return
    if (!result.ok) {
      onToast({ tone: 'warning', title: '没有可预览的内容', message: result.message || '' })
      return
    }
    setPreview(result)
    setShowPreview(true)
  }

  async function handleCancel() {
    const pending = inFlight.current
    if (!pending) return
    await callDesktop(onToast, '取消请求', () =>
      window.desktopAPI!.cancelSummarize(pending.requestId),
    )
  }

  async function handleDelete() {
    const result = await callDesktop(onToast, '删除总结', () =>
      window.desktopAPI!.deleteDaySummary(dayKey),
    )
    if (!result?.ok) return
    setSummaries((prev) => {
      const next = { ...(prev || {}) }
      delete next[dayKey]
      return next
    })
  }

  async function handleCopy() {
    if (!active) return
    try {
      await navigator.clipboard.writeText(active.text)
      onToast({ tone: 'success', title: '已复制', message: '当天总结已在剪贴板里。' })
    } catch {
      onToast({ tone: 'danger', title: '复制失败', message: '系统拒绝了剪贴板访问。' })
    }
  }

  if (!window.desktopAPI) return null

  if (!config) {
    return <p className="desk-daysum-loading">正在读取模型配置…</p>
  }

  if (!channels.length) {
    return (
      <div className="desk-daysum desk-daysum--off">
        <span>还没有配置模型通道，这一天的内容不会发往任何地址。</span>
        <button className="desk-btn-secondary" onClick={onGoToSettings}>
          前往设置中心配置
        </button>
      </div>
    )
  }

  return (
    <div className="desk-daysum">
      <div className="desk-daysum-head">
        <Sparkles size={13} />
        <strong>模型辅助总结</strong>
        <span className="desk-daysum-channel">
          {config.activeId
            ? channels.find((c) => c.id === config.activeId)?.name || '默认通道'
            : '未选默认通道'}
        </span>
        {active && (
          <span className="desk-daysum-meta">
            由 {active.model} 生成于 {formatClock(active.generatedAt)} · 依据{' '}
            {active.includedMessages} 条原话
          </span>
        )}
      </div>

      {active && <p className="desk-daysum-text">{active.text}</p>}

      {phase === 'error' && (
        <p className="desk-daysum-error" role="alert">
          {error}
        </p>
      )}

      <div className="desk-daysum-actions">
        {phase === 'running' ? (
          <button className="desk-btn-secondary" onClick={() => void handleCancel()}>
            取消生成
          </button>
        ) : (
          <button className="desk-btn-primary" onClick={() => void generate()}>
            {active ? '重新生成' : '生成总结'}
          </button>
        )}
        <button
          className="desk-btn-ghost"
          onClick={() => void handlePreview()}
          aria-expanded={showPreview}
        >
          <Eye size={12} />
          <span>{showPreview ? '收起发送内容' : '发送内容预览'}</span>
        </button>
        {active && (
          <>
            <button className="desk-btn-ghost" onClick={() => void handleCopy()}>
              复制
            </button>
            <button
              className="desk-btn-ghost desk-daysum-danger"
              onClick={() => void handleDelete()}
            >
              <Trash2 size={12} />
              <span>删除</span>
            </button>
          </>
        )}
      </div>

      <div className={classNames('desk-daysum-preview', showPreview && 'is-open')}>
        {showPreview && preview?.ok && (
          <>
            <p className="desk-daysum-preview-note">
              下面就是点「生成总结」时真正发出去的全部文本（共 {preview.meta?.chars} 字 · 纳入{' '}
              {preview.meta?.includedMessages} 条 ·
              {preview.meta?.omittedMessages
                ? ` 因预算未纳入 ${preview.meta.omittedMessages} 条`
                : ' 未触发字数预算'}
              {preview.meta?.unreadable?.length
                ? ` · 未取到正文的来源 ${preview.meta.unreadable.length} 个`
                : ''}
              ）：
            </p>
            <pre className="desk-daysum-pre">{preview.text}</pre>
          </>
        )}
      </div>
    </div>
  )
}
