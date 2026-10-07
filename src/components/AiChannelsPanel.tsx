import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, Trash2, Wand2 } from 'lucide-react'
import { callDesktop, type ToastPusher } from '../lib/main-call'
import { classNames } from '../lib/utils'

interface AiChannelsPanelProps {
  onToast: ToastPusher
}

interface Draft {
  id?: string
  name: string
  protocol: 'openai' | 'anthropic'
  baseUrl: string
  model: string
  key: string
}

const EMPTY: Draft = { name: '', protocol: 'openai', baseUrl: '', model: '', key: '' }

/** 预置只是把 Base URL 填好，模型名和地址都可改 —— 不替用户决定用哪家 */
const PRESETS: Array<{ label: string; draft: Omit<Draft, 'name' | 'key'> }> = [
  {
    label: 'OpenAI',
    draft: { protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  },
  {
    label: 'Anthropic',
    draft: {
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    },
  },
  {
    label: 'DeepSeek',
    draft: { protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  },
  {
    label: 'Kimi 月之暗面',
    draft: { protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-latest' },
  },
  {
    label: '智谱 GLM',
    draft: {
      protocol: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.5-air',
    },
  },
  {
    label: 'Ollama（本机）',
    draft: { protocol: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b' },
  },
  {
    label: 'LM Studio（本机）',
    draft: { protocol: 'openai', baseUrl: 'http://127.0.0.1:1234/v1', model: '' },
  },
]

const SAVE_TIMEOUT_MS = 10_000
const TEST_TIMEOUT_MS = 20_000

function field(label: string, hint?: string) {
  return (
    <span className="desk-ai-field-label">
      {label}
      {hint && <small>{hint}</small>}
    </span>
  )
}

/**
 * 模型通道配置区。
 * 密钥只在主进程加密落盘，这里永远读不回来：已保存的通道只显示「已配置密钥」，
 * 保存时留空表示保留原密钥，填新值才覆盖。
 */
export function AiChannelsPanel({ onToast }: AiChannelsPanelProps) {
  const [state, setState] = useState<AiConfigState | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [revealKey, setRevealKey] = useState(false)

  const reload = useCallback(async () => {
    if (!window.desktopAPI) return
    const result = await callDesktop(onToast, '读取模型配置', () =>
      window.desktopAPI!.getAiConfig(),
    )
    if (result) setState(result)
  }, [onToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const channels = state?.channels ?? []
  const keyStorageBlocked = state?.keyStorage === 'unavailable'

  async function handleSave() {
    if (!draft || !window.desktopAPI) return
    setBusy('save')
    const payload: Partial<AiChannelPublic> & { key?: string } = {
      id: draft.id,
      name: draft.name,
      protocol: draft.protocol,
      baseUrl: draft.baseUrl,
      model: draft.model,
    }
    // 只有真正输入了新值才带 key 字段：不带 = 主进程保留原密钥，空串 = 清除
    if (draft.key !== '') payload.key = draft.key
    else if (draft.id === undefined) payload.key = ''
    const result = await callDesktop(
      onToast,
      '保存模型通道',
      () => window.desktopAPI!.saveAiChannel(payload),
      SAVE_TIMEOUT_MS,
    )
    setBusy(null)
    if (!result) return
    if (!result.ok) {
      onToast({ tone: 'danger', title: '没有保存', message: result.message || '请检查填写内容' })
      return
    }
    onToast({
      tone: 'success',
      title: draft.id ? '通道已更新' : '通道已添加',
      message: '密钥已用系统钥匙串加密保存，界面不再回显。',
    })
    setDraft(null)
    setRevealKey(false)
    await reload()
  }

  async function handleTest(channel: AiChannelPublic) {
    if (!window.desktopAPI) return
    setBusy('test')
    const result = await callDesktop(
      onToast,
      '测试连接',
      () => window.desktopAPI!.testAiChannel(channel.id),
      TEST_TIMEOUT_MS,
    )
    setBusy(null)
    if (!result) return
    if (result.ok) {
      onToast({
        tone: 'success',
        title: `${channel.name} 连接正常`,
        message: `${result.ms} 毫秒 · ${result.endpoint}`,
      })
    } else {
      onToast({
        tone: 'danger',
        title: `${channel.name} 连不上`,
        message: result.message || '未知错误',
      })
    }
  }

  async function handleSetActive(channel: AiChannelPublic) {
    const result = await callDesktop(onToast, '设为默认', () =>
      window.desktopAPI!.setActiveAiChannel(channel.id),
    )
    if (result?.ok) await reload()
    else if (result) onToast({ tone: 'danger', title: '设置失败', message: result.message || '' })
  }

  async function handleRemove(channel: AiChannelPublic) {
    const result = await callDesktop(onToast, '删除通道', () =>
      window.desktopAPI!.deleteAiChannel(channel.id),
    )
    if (result?.ok) {
      onToast({ tone: 'success', title: '已删除', message: `${channel.name} 及其密钥已移除。` })
      if (draft?.id === channel.id) setDraft(null)
      await reload()
    } else if (result) {
      onToast({ tone: 'danger', title: '删除失败', message: result.message || '' })
    }
  }

  return (
    <div className="desk-ai-panel">
      <p className="desk-ai-privacy">
        只有在这里配好通道、并且你在「会话档案 → 日历 → 某一天」里主动点「生成总结」时， 软件才会
        <strong>向你填写的那个地址发出一次请求</strong>。发送内容是
        <strong>当天统计 + 你自己发出的消息</strong>
        （每条最多 200 字、全天 24000 字封顶，先在本机脱敏），不含模型回复、不含工具输出。
        任何时候都可以在当天的「发送内容预览」里看到真正发出去的完整文本。
      </p>

      {keyStorageBlocked && (
        <p className="desk-ai-warn" role="alert">
          本机系统钥匙串不可用，<strong>API 密钥无法安全保存</strong>（本软件不会退化成明文落盘）。
          仍可使用不需要密钥的本机模型，例如 Ollama。
        </p>
      )}

      {channels.length === 0 && !draft && (
        <p className="desk-ai-empty">还没有配置模型通道。下面选一个预置或直接填本机地址。</p>
      )}

      <ul className="desk-ai-list">
        {channels.map((c) => (
          <li
            key={c.id}
            className={classNames('desk-ai-item', state?.activeId === c.id && 'is-active')}
          >
            <div className="desk-ai-item-head">
              <strong>{c.name}</strong>
              {state?.activeId === c.id && <span className="desk-ai-badge">默认</span>}
              <span className="desk-ai-proto">
                {c.protocol === 'openai' ? 'OpenAI 兼容' : 'Anthropic'}
              </span>
              <span className="desk-ai-key">{c.hasKey ? '已配置密钥' : '无密钥'}</span>
            </div>
            <code className="desk-ai-url">{c.baseUrl}</code>
            <span className="desk-ai-model">{c.model || '（未填模型名）'}</span>
            <div className="desk-ai-actions">
              <button
                className="desk-btn-secondary"
                onClick={() => void handleTest(c)}
                disabled={busy !== null}
                title={busy === 'test' ? '正在测试' : '发一条最短请求验证地址与密钥可用'}
              >
                {busy === 'test' ? '测试中…' : '测试连接'}
              </button>
              {state?.activeId !== c.id && (
                <button
                  className="desk-btn-ghost"
                  onClick={() => void handleSetActive(c)}
                  disabled={busy !== null}
                >
                  设为默认
                </button>
              )}
              <button
                className="desk-btn-ghost"
                onClick={() =>
                  setDraft({
                    id: c.id,
                    name: c.name,
                    protocol: c.protocol,
                    baseUrl: c.baseUrl,
                    model: c.model,
                    key: '',
                  })
                }
              >
                编辑
              </button>
              <button
                className="desk-btn-ghost desk-ai-danger"
                onClick={() => void handleRemove(c)}
                disabled={busy !== null}
              >
                <Trash2 size={12} />
                <span>删除</span>
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!draft ? (
        <div className="desk-ai-presets">
          <span className="desk-ai-presets-label">预置</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="desk-tool-chip"
              onClick={() => setDraft({ ...EMPTY, name: p.label.replace(/（.*$/, ''), ...p.draft })}
            >
              {p.label}
            </button>
          ))}
          <button className="desk-btn-secondary" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={13} />
            <span>自定义通道</span>
          </button>
        </div>
      ) : (
        <div className="desk-ai-form desk-enter">
          <h4 className="desk-ai-form-title">
            <Wand2 size={13} />
            {draft.id ? '编辑通道' : '新增通道'}
          </h4>
          <label className="desk-ai-field">
            {field('名称')}
            <input
              className="desk-field-input"
              value={draft.name}
              maxLength={40}
              placeholder="例如 本机 Qwen"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="desk-ai-field">
            {field('协议')}
            <div className="desk-pill-group">
              {(['openai', 'anthropic'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={classNames('desk-pill-btn', draft.protocol === p && 'active')}
                  aria-pressed={draft.protocol === p}
                  onClick={() => setDraft({ ...draft, protocol: p })}
                >
                  {p === 'openai' ? 'OpenAI 兼容' : 'Anthropic'}
                </button>
              ))}
            </div>
          </label>
          <label className="desk-ai-field">
            {field('Base URL', '允许本机与内网地址，例如 http://127.0.0.1:11434/v1')}
            <input
              className="desk-field-input"
              value={draft.baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
          </label>
          <label className="desk-ai-field">
            {field('模型')}
            <input
              className="desk-field-input"
              value={draft.model}
              maxLength={120}
              placeholder="qwen3:8b"
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <label className="desk-ai-field">
            {field(
              'API 密钥',
              draft.id ? '留空 = 保留已保存的密钥' : '本机会用系统钥匙串加密后保存',
            )}
            <div className="desk-ai-key-row">
              <input
                className="desk-field-input"
                type={revealKey ? 'text' : 'password'}
                value={draft.key}
                autoComplete="off"
                spellCheck={false}
                placeholder={draft.id ? '（不修改则留空）' : 'sk-…'}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              />
              <button
                type="button"
                className="desk-btn-ghost"
                onClick={() => setRevealKey((v) => !v)}
                aria-pressed={revealKey}
                title={revealKey ? '隐藏' : '显示正在输入的密钥'}
              >
                <KeyRound size={13} />
                <span>{revealKey ? '隐藏' : '显示'}</span>
              </button>
              {draft.id && (
                <button
                  type="button"
                  className="desk-btn-ghost"
                  onClick={() => setDraft({ ...draft, key: '' })}
                  title="下次保存时清除已存的密钥"
                >
                  清除已存密钥
                </button>
              )}
            </div>
          </label>
          <div className="desk-ai-form-actions">
            <button
              className="desk-btn-primary"
              onClick={() => void handleSave()}
              disabled={busy !== null}
            >
              {busy === 'save' ? '保存中…' : '保存'}
            </button>
            <button
              className="desk-btn-secondary"
              onClick={() => {
                setDraft(null)
                setRevealKey(false)
              }}
              disabled={busy !== null}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
