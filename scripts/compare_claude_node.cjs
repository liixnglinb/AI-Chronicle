// 逐文件输出 AI 轨迹口径的 token 总量：node compare_claude_node.cjs <file-list-json>
'use strict'
const path = require('node:path')
const { parseClaudeLikeFile } = require(path.join(process.cwd(), 'electron', 'ingest.cjs'))

async function main() {
  const files = JSON.parse(process.argv[2])
  for (const f of files) {
    try {
      const s = await parseClaudeLikeFile('claude-code', f)
      process.stdout.write(
        JSON.stringify({
          f: path.basename(f),
          tok: s.tokensIn + s.tokensCached + s.tokensOut,
        }) + '\n',
      )
    } catch (err) {
      process.stdout.write(JSON.stringify({ f: path.basename(f), tok: -1, err: String(err).slice(0, 80) }) + '\n')
    }
  }
}

main()
