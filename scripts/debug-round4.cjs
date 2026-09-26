// catpaw 用户文本定位 + hermes 采集结果 dump
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

const HOME = os.homedir()
const target = path.join(
  HOME, '.catpaw', 'projects',
  'C--Users------meituan-catpaw-3375670534-desk-default-workspace',
  'ef3e611f-8ab3-4d31-93dc-590a30cb9c53.jsonl',
)

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(target, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  let userIdx = 0
  for await (const line of rl) {
    const t = line.trim()
    if (!t) continue
    let o
    try {
      o = JSON.parse(t)
    } catch {
      continue
    }
    if (o.type !== 'user') continue
    userIdx += 1
    if (userIdx > 8) break
    const m = o.message || {}
    const parts = Array.isArray(m.content) ? m.content : []
    const kinds = parts.map((c) => c && c.type).join(',')
    const texts = parts
      .filter((c) => c && (c.type === 'text' || c.type === 'input_text') && typeof c.text === 'string')
      .map((c) => String(c.text).replace(/\s+/g, ' ').slice(0, 70))
    console.log(`user#${userIdx} [${kinds}]`, JSON.stringify(texts))
  }
  console.log('user 行总数检查完毕')

  // hermes 采集结果
  const { collectAll } = require('../electron/ingest.cjs')
  const result = await collectAll({
    cachePath: path.join(os.tmpdir(), 'chronicle-debug-cache.json'),
  })
  const hermes = result.sessions.filter((s) => s.tool === 'hermes').slice(0, 4)
  console.log('--- hermes 采集样例 ---')
  for (const s of hermes) {
    console.log(JSON.stringify({ title: s.title, turns: s.turns, start: s.start, project: s.project }, null, 0))
  }
  const hermesSrc = result.sources.find((x) => x.id === 'hermes')
  console.log('hermes 源状态:', JSON.stringify(hermesSrc))
  const catpaw = result.sessions.filter((s) => s.tool === 'catpaw')
  const titled = catpaw.filter((s) => s.title && s.title !== '(未记录输入)')
  console.log(`catpaw 会话 ${catpaw.length}, 有标题 ${titled.length}`)
  for (const s of titled.slice(0, 3)) console.log('  catpaw 标题:', s.title)
}

main()
