// 钻取 WorkBuddy/CatPaw 原始行结构与 usage 位置
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

const HOME = os.homedir()

async function analyze(root, label) {
  let target = null
  let maxSeen = 0
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory() && e.name !== 'subagents') walk(f)
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        const sz = fs.statSync(f).size
        if (sz > maxSeen && sz < 30 * 1024 * 1024) {
          maxSeen = sz
          target = f
        }
      }
    }
  }
  walk(root)
  console.log(`== ${label} 分析: ${target} (${(maxSeen / 1048576).toFixed(1)}MB)`)
  const rl = readline.createInterface({
    input: fs.createReadStream(target, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  const types = {}
  let bad = 0
  let badSample = ''
  const usageSamples = []
  const roleSamples = {}
  let n = 0
  for await (const line of rl) {
    const t = line.trim()
    if (!t) continue
    n += 1
    try {
      const o = JSON.parse(t)
      types[o.type] = (types[o.type] || 0) + 1
      const role = o.role || (o.message && o.message.role)
      if (role) roleSamples[role] = (roleSamples[role] || 0) + 1
      const s = t
      if (usageSamples.length < 3 && s.includes('usage')) {
        usageSamples.push(s.slice(0, 500))
      }
    } catch {
      bad += 1
      if (!badSample && t.length > 20) badSample = t.slice(0, 260)
    }
  }
  console.log(`${label} 总行 ${n}, 类型:`, JSON.stringify(types))
  console.log(`${label} 角色:`, JSON.stringify(roleSamples), ' 坏行:', bad)
  if (badSample) console.log(`${label} 坏行样例:`, badSample)
  for (const u of usageSamples) console.log(`${label} usage 样例:`, u)
}

async function main() {
  await analyze(path.join(HOME, '.workbuddy', 'projects'), 'workbuddy')
  await analyze(path.join(HOME, '.catpaw', 'projects'), 'catpaw')
}
main()
