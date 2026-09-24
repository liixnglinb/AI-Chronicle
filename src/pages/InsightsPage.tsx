import {
  ArrowDownRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Clock3,
  Coins,
  Gauge,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { tokenTrend, tools, weeklyActivity } from '../data/mockData'
import { saveText } from '../lib/desktop'
import { ToolBadge } from '../components/StatusBadges'
import type { ToastMessage } from '../types'

interface InsightsPageProps {
  onToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function InsightsPage({ onToast }: InsightsPageProps) {
  async function exportInsightReport() {
    const rows = [
      '日期,代码分钟,对话分钟,其他分钟,Token',
      ...weeklyActivity.map((day, index) =>
        [
          day.day,
          day.code,
          day.chat,
          day.other,
          tokenTrend[index]?.tokens ?? 0,
        ].join(','),
      ),
    ]
    const result = await saveText(
      'AI工作洞察-2026-09-24.csv',
      `\uFEFF${rows.join('\n')}`,
    )
    onToast({
      tone: 'success',
      title: '洞察报告已导出',
      message: result.message ?? 'CSV 报告已保存。',
    })
  }

  return (
    <div className="page insights-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">
            <ChartNoAxesCombined size={14} />
            7 日趋势
          </span>
          <h1>AI 工作洞察</h1>
          <p>观察投入结构、Token 消耗与不同软件在真实工作中的作用。</p>
        </div>
        <div className="insight-range">
          <span>最近 7 天</span>
          <button
            className="button button-secondary"
            type="button"
            onClick={exportInsightReport}
          >
            导出报告
          </button>
        </div>
      </section>

      <section className="insight-summary">
        <article>
          <span className="insight-icon insight-icon-green">
            <Clock3 size={17} />
          </span>
          <div>
            <small>日均活跃</small>
            <strong>4h 38m</strong>
            <span className="trend-up">
              <ArrowUpRight size={13} /> 12%
            </span>
          </div>
        </article>
        <article>
          <span className="insight-icon insight-icon-blue">
            <Coins size={17} />
          </span>
          <div>
            <small>本周 Token</small>
            <strong>279k</strong>
            <span className="trend-up">
              <ArrowUpRight size={13} /> 18%
            </span>
          </div>
        </article>
        <article>
          <span className="insight-icon insight-icon-amber">
            <Gauge size={17} />
          </span>
          <div>
            <small>有效记录率</small>
            <strong>92%</strong>
            <span className="trend-flat">稳定</span>
          </div>
        </article>
        <article>
          <span className="insight-icon insight-icon-coral">
            <WandSparkles size={17} />
          </span>
          <div>
            <small>最高产软件</small>
            <strong>Codex</strong>
            <span className="trend-up">
              <ArrowUpRight size={13} /> 32%
            </span>
          </div>
        </article>
      </section>

      <div className="insights-grid">
        <section className="surface insight-chart-card insight-chart-wide">
          <header className="surface-header">
            <div>
              <span className="section-kicker">投入结构</span>
              <h2>每天如何分配 AI 时间</h2>
            </div>
            <span className="header-note">分钟</span>
          </header>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity} barGap={5}>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-hover)' }}
                  contentStyle={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                />
                <Bar dataKey="code" name="代码" stackId="a" fill="#0f9d8a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="chat" name="对话" stackId="a" fill="#4e8aff" />
                <Bar dataKey="other" name="其他" stackId="a" fill="#e1a63b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="surface insight-chart-card">
          <header className="surface-header">
            <div>
              <span className="section-kicker">Token 曲线</span>
              <h2>上下文消耗趋势</h2>
            </div>
            <span className="trend-up">
              <ArrowUpRight size={13} />
              18%
            </span>
          </header>
          <div className="chart-frame chart-frame-small">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tokenTrend}>
                <defs>
                  <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f9d8a" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0f9d8a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  name="Token"
                  stroke="#0f9d8a"
                  strokeWidth={2}
                  fill="url(#tokenFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="surface insight-chart-card">
          <header className="surface-header">
            <div>
              <span className="section-kicker">软件效率</span>
              <h2>今日工具贡献</h2>
            </div>
          </header>
          <div className="tool-contribution-list">
            {tools.slice(0, 7).map((tool) => (
              <div className="tool-contribution" key={tool.id}>
                <span className="tool-contribution-name">
                  <ToolBadge toolId={tool.id} />
                  {tool.name}
                </span>
                <div className="tool-contribution-track">
                  <span
                    style={{
                      width: `${Math.min(100, (tool.usageMinutes / 156) * 100)}%`,
                      background: tool.color,
                    }}
                  />
                </div>
                <strong>{tool.usageMinutes}m</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="surface insight-chart-card">
          <header className="surface-header">
            <div>
              <span className="section-kicker">年度节奏</span>
              <h2>最近 12 周活跃度</h2>
            </div>
            <span className="header-note">越深代表投入越多</span>
          </header>
          <div className="heatmap-wrap">
            <div className="heatmap-months">
              <span>7 月</span>
              <span>8 月</span>
              <span>9 月</span>
            </div>
            <div className="activity-heatmap" aria-label="最近十二周活动热力图">
              {Array.from({ length: 84 }, (_, index) => {
                const intensity = (index * 7 + 13) % 6
                return (
                  <span
                    key={index}
                    className={`heat-cell heat-level-${intensity}`}
                    title={`${Math.max(0, intensity * 34)} 分钟`}
                  />
                )
              })}
            </div>
            <div className="heatmap-legend">
              <span>少</span>
              {[0, 1, 2, 3, 4, 5].map((level) => (
                <i className={`heat-cell heat-level-${level}`} key={level} />
              ))}
              <span>多</span>
            </div>
          </div>
        </section>
      </div>

      <section className="insight-note">
        <span className="insight-note-icon">
          <Sparkles size={18} />
        </span>
        <div>
          <strong>本周期观察</strong>
          <p>
            你在上午 09:00 至 11:30 的 AI 会话完成率最高，平均产出间隔比下午短 23%。
            周二到周四适合安排需要持续上下文的复杂任务。
          </p>
        </div>
        <span className="observation-badge">
          <ArrowDownRight size={13} />
          下午切换成本偏高
        </span>
      </section>
    </div>
  )
}
