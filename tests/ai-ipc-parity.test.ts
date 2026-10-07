import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// IPC 三面一致性：主进程 handler、preload 白名单、渲染层类型声明三处必须同时改。
// 这个仓库已经吃过"改了主进程忘了 preload 白名单 → 界面点了没反应"的亏，
// 所以把不变量写成测试，而不是靠人记住。
const root = process.cwd()
const main = readFileSync(join(root, 'electron/main.cjs'), 'utf8')
const preload = readFileSync(join(root, 'electron/preload.cjs'), 'utf8')
const dts = readFileSync(join(root, 'src/global.d.ts'), 'utf8')

const handled = new Set([...main.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]))
const invoked = new Set(
  [...preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]),
)

describe('IPC 三面一致性', () => {
  it('主进程确实注册了通道（探针本身有效）', () => {
    expect(handled.size).toBeGreaterThan(10)
    expect(handled.has('desktop:ingest')).toBe(true)
  })

  it('preload 不转发主进程没注册的通道', () => {
    const orphans = [...invoked].filter((channel) => !handled.has(channel))
    expect(orphans, `preload 转发了不存在的通道: ${orphans.join(', ')}`).toEqual([])
  })

  it('preload 每个方法在渲染层类型里都有声明', () => {
    const methods = [...preload.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*(?:\(|async)/gm)].map(
      (m) => m[1],
    )
    expect(methods.length).toBeGreaterThan(10)
    const missing = methods.filter((name) => !new RegExp(`\\b${name}:\\s*\\(`).test(dts))
    expect(missing, `global.d.ts 缺少声明: ${missing.join(', ')}`).toEqual([])
  })

  it('模型相关的通道三处齐备', () => {
    for (const channel of [
      'desktop:get-ai-config',
      'desktop:save-ai-channel',
      'desktop:delete-ai-channel',
      'desktop:set-active-ai-channel',
      'desktop:test-ai-channel',
      'desktop:preview-day-payload',
      'desktop:summarize-day',
      'desktop:cancel-summarize',
      'desktop:get-day-summaries',
      'desktop:delete-day-summary',
    ]) {
      expect(handled.has(channel), `主进程缺 ${channel}`).toBe(true)
      expect(invoked.has(channel), `preload 缺 ${channel}`).toBe(true)
    }
    for (const name of [
      'getAiConfig',
      'saveAiChannel',
      'deleteAiChannel',
      'setActiveAiChannel',
      'testAiChannel',
      'previewDayPayload',
      'summarizeDay',
      'cancelSummarize',
      'getDaySummaries',
      'deleteDaySummary',
    ]) {
      expect(dts, `global.d.ts 缺 ${name}`).toContain(`${name}: (`)
    }
  })
})
