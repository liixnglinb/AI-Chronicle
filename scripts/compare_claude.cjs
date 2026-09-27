// 逐文件对账：Token Monitor 口径 vs AI 轨迹解析器（纯 Node，无子进程）
// 用法：node scripts/compare_claude.cjs   （TOP8=1 只看最大 8 个文件）
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { parseClaudeLikeFile } = require(path.join(process.cwd(), 'electron', 'ingest.cjs'))

const ROOT = path.join(os.homedir(), '.claude', 'projects')

// Token Monitor _claude_file 同口径：assistant+usage，按 message.id 保留末条
function tmStyleTotalSync(path2) {
  const seen = new Map()
  let raw
  try {
    raw = fs.readFileSync(path2, 'utf8')
  } catch {
    return -1
  }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let obj
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }
    if (obj.type !== 'assistant') continue
    const m = obj.message || {}
    const u = m.usage
    if (!u || typeof u !== 'object') continue
    const k = m.id || obj.uuid
    if (!k) continue
    seen.set(String(k), (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0) + (u.output_tokens || 0))
  }
  let total = 0
  for (const v of seen.values()) total += v
  return total
}

async function main() {
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.isFile() && e.name.endsWith('.jsonl')) files.push(f)
    }
  }
  walk(ROOT)
  if (process.env.TOP8) {
    files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
    files.length = Math.min(files.length, 8)
  } else {
    files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
  }

  let tmAll = 0
  let myAll = 0
  let diffFiles = 0
  for (const f of files) {
    const tm = tmStyleTotalSync(f)
    let my = -1
    try {
      const s = await parseClaudeLikeFile('claude-code', f)
      my = s.tokensIn + s.tokensCached + s.tokensOut
    } catch {
      my = -1
    }
    tmAll += Math.max(tm, 0)
    myAll += Math.max(my, 0)
    const diff = my - tm
    if (Math.abs(diff) >= 1000) {
      diffFiles += 1
      if (diffFiles <= 15 || process.env.TOP8) {
        console.log(
          `${path.basename(f).slice(0, 42).padEnd(44)}TM ${tm.toLocaleString().padStart(15)}  我 ${String(my).toLocaleString().padStart(15)}  差 ${diff.toLocaleString()}`,
        )
      }
    }
  }
  console.log(`\n合计 ${files.length} 文件: TM ${tmAll.toLocaleString()}  AI轨迹 ${myAll.toLocaleString()}  差 ${(myAll - tmAll).toLocaleString()}  分歧文件 ${diffFiles}`)
}

main()
