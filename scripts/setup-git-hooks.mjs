// 启用 Git 钩子：把 core.hooksPath 指向 .husky，让仓库内的钩子直接生效。
//
// 为什么不用 husky：husky 的安装器依赖 `git` 子进程 + shell，在受限环境下
// （Node 无法派生 cmd.exe）会失败并阻断 npm install。这里用 execFileSync 直接
// 调用 git 可执行文件，不经过 shell，跨平台且失败也不影响安装。
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const hooksDir = path.join(root, '.husky')

// CI 上不需要 Git 钩子（流水线会显式执行 lint / test）
if (process.env.CI) {
  process.exit(0)
}

if (!existsSync(path.join(root, '.git'))) {
  process.exit(0)
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.husky'], { stdio: 'ignore' })
  for (const hook of ['pre-commit', 'commit-msg']) {
    const file = path.join(hooksDir, hook)
    if (!existsSync(file)) continue
    try {
      chmodSync(file, 0o755)
    } catch {
      // Windows 下由 Git for Windows 自带的 sh 执行，无需可执行位
    }
  }
  console.log('[hooks] Git 钩子已启用：core.hooksPath=.husky')
} catch {
  console.warn('[hooks] 未能启用 Git 钩子（不影响开发、测试与构建）')
}
