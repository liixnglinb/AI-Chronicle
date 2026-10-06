import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('构建源资产完整性', () => {
  it('generate-icon.mjs 引用的 public 源资产必须存在（曾因删 tray.svg 打断 CI 发版）', () => {
    const script = readFileSync('scripts/generate-icon.mjs', 'utf8')
    const refs = [...script.matchAll(/'public',\s*'([\w.-]+)'/g)].map((m) => `public/${m[1]}`)
    expect(refs.length).toBeGreaterThan(0)
    for (const rel of refs) {
      expect(existsSync(rel), `${rel} 缺失：图标生成会在 CI 上挂`).toBe(true)
    }
  })

  it('安装包不得重复打进已被 Vite 打包的前端依赖', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>
      build: { files: string[] }
    }
    // 排除的是"再塞一份进 asar"，不是把它们移出 dependencies ——
    // 留在 dependencies 才能让 CI 的 `npm audit --omit=dev` 覆盖到实际 shipped 的代码。
    for (const name of ['react', 'react-dom', 'scheduler', 'lucide-react']) {
      expect(
        pkg.build.files.some((f) => f === `!node_modules/${name}/**`),
        `${name} 又被打进 asar 了（lucide-react 一个包占原 asar 解包体积的 74%）`,
      ).toBe(true)
    }
    for (const name of ['react', 'react-dom', 'lucide-react']) {
      expect(
        pkg.dependencies[name],
        `${name} 必须留在 dependencies，否则审计漏掉 shipped 代码`,
      ).toBeTruthy()
    }
  })

  it('主进程入口文件必须存在（package.json → main）', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { main: string }
    expect(existsSync(pkg.main), `main 指向不存在的文件：${pkg.main}`).toBe(true)
  })
})
