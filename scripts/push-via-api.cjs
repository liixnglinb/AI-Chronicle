// 通过 GitHub API 推送提交（github.com:443 不通时的降级通道，gh 走 api.github.com）
// 用法: node scripts/push-via-api.cjs "<commit message>" [--tag vX.Y.Z]
'use strict'
const { execFileSync } = require('node:child_process')

const REPO = 'liixnglinb/AI-Chronicle'
const message = process.argv[2] || 'update'
const tag = process.argv.includes('--tag')
  ? process.argv[process.argv.indexOf('--tag') + 1]
  : null

function gh(path, method = 'GET', body = null) {
  const args = ['api', `repos/${REPO}/${path}`, '--method', method]
  if (body) args.push('--input', '-')
  return JSON.parse(
    execFileSync('gh', args, {
      input: body ? JSON.stringify(body) : undefined,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    }),
  )
}

function main() {
  // 1. 远端 main 当前指向（推送基准）
  const ref = gh('git/ref/heads/main')
  const baseSha = ref.object.sha
  const baseCommit = gh(`git/commits/${baseSha}`)
  console.log('远端 main:', baseSha.slice(0, 10), 'tree:', baseCommit.tree.sha.slice(0, 10))

  // 2. 本地 HEAD 树相对远端基准的文件差异（含删除）。
  //    本地历史可能与远端分叉（内容一致）——此时退回用 HEAD~1 作为差异基准，
  //    但必须先校验两边树对象一致，防止把错误基底的内容当成增量。
  let diffBase = baseSha
  try {
    execFileSync('git', ['cat-file', '-e', `${baseSha}^{commit}`], { stdio: 'pipe' })
  } catch {
    diffBase = 'HEAD~1'
    const localTree = execFileSync('git', ['rev-parse', 'HEAD~1^{tree}'], { encoding: 'utf8' }).trim()
    if (localTree !== baseCommit.tree.sha) {
      console.error(`⚠ 本地 HEAD~1 树 ${localTree.slice(0, 10)} != 远端树 ${baseCommit.tree.sha.slice(0, 10)}，基底不一致，中止`)
      process.exit(2)
    }
    console.log(`本地无远端对象（历史分叉），以 HEAD~1 为差异基准（树一致 ${localTree.slice(0, 10)}）`)
  }
  const ahead = execFileSync('git', ['diff', '--stat', diffBase, 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (!ahead) {
    // 树完全一致：检查是否只是领先提交（内容无差异则无需推）
  }
  const changed = execFileSync('git', ['diff', '--name-status', diffBase, 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [status, ...rest] = l.split(/\t+/)
      return { status, path: rest.join('\t') }
    })
  if (!changed.length) {
    console.log('本地树与远端一致，无需推送')
    return
  }
  console.log('变更文件:', changed.length)

  // 4. 逐个建 blob
  const treeItems = []
  for (const item of changed) {
    if (item.status === 'D') {
      treeItems.push({ path: item.path, sha: null, mode: '100644', type: 'blob' })
      continue
    }
    const content = require('node:fs').readFileSync(item.path)
    const blob = gh('git/blobs', 'POST', {
      content: content.toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: item.path, sha: blob.sha, mode: '100644', type: 'blob' })
    console.log('  blob', item.path, blob.sha.slice(0, 8))
  }

  // 5. tree → commit → 更新 ref
  const tree = gh('git/trees', 'POST', {
    base_tree: baseCommit.tree.sha,
    tree: treeItems,
  })
  const commit = gh('git/commits', 'POST', {
    message,
    tree: tree.sha,
    parents: [baseSha],
  })
  gh('git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false })
  console.log('✅ 已推送:', commit.sha.slice(0, 10), '-', message.slice(0, 60))

  // 6. 校验远端内容
  const verify = gh('git/ref/heads/main')
  console.log('远端现为:', verify.object.sha.slice(0, 10))

  // 7. 可选打 tag（触发 release workflow）
  if (tag) {
    try {
      gh('git/refs', 'POST', { ref: `refs/tags/${tag}`, sha: commit.sha })
      console.log(`✅ 标签 ${tag} 已创建，release workflow 将自动构建`)
    } catch (err) {
      console.error('标签创建失败（可能已存在）:', String(err.message).slice(0, 120))
    }
  }
}

main()
