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
})
