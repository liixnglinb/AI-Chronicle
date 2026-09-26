// 独立验证 ingest.cjs：用系统 Node 直接跑，输出汇总
'use strict'
const os = require('node:os')
const path = require('node:path')
const { collectAll } = require('../electron/ingest.cjs')

async function main() {
  const t0 = Date.now()
  const result = await collectAll({
    cachePath: path.join(os.tmpdir(), 'chronicle-test-cache.json'),
  })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  const byTool = new Map()
  for (const s of result.sessions) {
    const cur = byTool.get(s.tool) || { n: 0, tok: 0, sample: '' }
    cur.n += 1
    cur.tok += s.tokensIn + s.tokensOut + s.tokensCached
    if (!cur.sample && s.title) cur.sample = s.title.slice(0, 40)
    byTool.set(s.tool, cur)
  }
  console.log('耗时:', secs + 's', ' 缓存:', JSON.stringify(result.cacheStats))
  console.log('总会话:', result.sessions.length)
  for (const [tool, v] of [...byTool.entries()].sort((a, b) => b[1].tok - a[1].tok)) {
    console.log(
      `  ${tool.padEnd(14)} 会话 ${String(v.n).padStart(4)}  tokens ${String(v.tok).padStart(12)}  例: ${v.sample}`,
    )
  }
  console.log('--- 数据源状态 ---')
  for (const src of result.sources) {
    console.log(
      `  ${src.id.padEnd(14)} ${src.status.padEnd(10)} 会话 ${String(src.sessionCount).padStart(4)}  ${src.detail || ''}`,
    )
  }
  // 抽样 3 条今天的会话
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todays = result.sessions.filter((s) => s.start && s.start >= today.getTime())
  console.log('--- 今天会话（前 5 条）---')
  for (const s of todays.slice(0, 5)) {
    console.log(
      `  [${s.tool}] ${new Date(s.start).toLocaleTimeString('zh-CN', { hour12: false })} ${s.project} :: ${s.title} (${s.turns} 轮)`,
    )
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
