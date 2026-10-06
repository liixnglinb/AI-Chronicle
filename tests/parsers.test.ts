import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseClaudeLikeFile } = require('../electron/ingest.cjs') as {
  parseClaudeLikeFile: (tool: string, filePath: string, dirNameHint?: string) => Promise<Parsed>
}

interface Parsed {
  id: string
  title: string
  turns: number
  projectPath: string
  project: string
  tokensIn: number
  tokensOut: number
  tokensCached: number
  hasTokens: boolean
  start: number | null
  end: number | null
}

const dirs: string[] = []
afterAll(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

function file(name: string, lines: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), 'chronicle-claude-'))
  dirs.push(dir)
  const p = join(dir, name)
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
  return p
}

const TS1 = '2026-10-04T01:00:00.000Z'
const TS2 = '2026-10-04T01:30:00.000Z'
const user = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'user',
  timestamp: TS1,
  cwd: 'D:\\work\\demo',
  message: { role: 'user', content: text },
  ...extra,
})
const assistant = (id: string, usage: Record<string, number>, model = 'claude-sonnet-x') => ({
  type: 'assistant',
  timestamp: TS2,
  message: { id, role: 'assistant', model, content: [{ type: 'text', text: '好的' }] },
  usage,
})

describe('parseClaudeLikeFile：Claude Code 形态', () => {
  it('字符串型 user content 计一轮并定标题', async () => {
    const s = await parseClaudeLikeFile(
      'claude-code',
      file('a.jsonl', [
        user('把下载页按钮改圆'),
        assistant('m1', { input_tokens: 10, output_tokens: 5 }),
      ]),
    )
    expect(s.turns).toBe(1)
    expect(s.title).toBe('把下载页按钮改圆')
    expect(s.projectPath).toBe('D:\\work\\demo')
    expect(s.project).toBe('demo')
  })

  it('同一 message.id 重复出现时用量只算末条（重试/流式更新不重复计钱）', async () => {
    const s = await parseClaudeLikeFile(
      'claude-code',
      file('b.jsonl', [
        user('开工'),
        assistant('m1', { input_tokens: 100, output_tokens: 10 }),
        assistant('m1', { input_tokens: 130, output_tokens: 12 }),
      ]),
    )
    expect(s.tokensIn).toBe(130)
    expect(s.tokensOut).toBe(12)
    expect(s.hasTokens).toBe(true)
  })

  it('tool_result 型 content 不算人类轮次', async () => {
    const s = await parseClaudeLikeFile(
      'claude-code',
      file('c.jsonl', [
        {
          type: 'user',
          timestamp: TS1,
          message: { role: 'user', content: [{ type: 'tool_result', content: '命令输出' }] },
        },
      ]),
    )
    expect(s.turns).toBe(0)
  })

  it('注入前缀要剥掉，标题落在真正的人类输入上', async () => {
    const s = await parseClaudeLikeFile(
      'claude-code',
      file('d.jsonl', [user('<sandbox_context/>真实问题：帮我看看这个报错')]),
    )
    expect(s.title).toBe('真实问题：帮我看看这个报错')
  })

  it('坏行忽略，不影响其余解析', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chronicle-claude-'))
    dirs.push(dir)
    const p = join(dir, 'e.jsonl')
    writeFileSync(
      p,
      [
        '{"type":"user","timestamp":"2026-10-04T01:00:00.000Z","message":{"role":"user","content":"第一句"}}',
        '{这不是合法 JSON',
        '',
        '{"type":"user","timestamp":"2026-10-04T02:00:00.000Z","message":{"role":"user","content":"第二句"}}',
      ].join('\n'),
      'utf8',
    )
    const s = await parseClaudeLikeFile('claude-code', p)
    expect(s.turns).toBe(2)
    expect(s.title).toBe('第一句')
  })
})

describe('parseClaudeLikeFile：子代理与 sidechain', () => {
  it('subagents 目录下的转录不记轮次，id 带 sub 前缀（随后并入父会话）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chronicle-sub-'))
    dirs.push(root)
    const nested = join(root, 'subagents')
    mkdirSync(nested)
    const p = join(nested, 'agent-1.jsonl')
    writeFileSync(p, JSON.stringify(user('子任务指令')) + '\n', 'utf8')
    const s = await parseClaudeLikeFile('claude-code', p)
    expect(s.turns).toBe(0)
    expect(s.id).toContain(':sub:')
  })

  it('isSidechain 行不计轮次、也不抢标题来源之外的字段', async () => {
    const s = await parseClaudeLikeFile(
      'claude-code',
      file('f.jsonl', [user('sidechain 里的指令', { isSidechain: true })]),
    )
    expect(s.turns).toBe(0)
  })
})

describe('parseClaudeLikeFile：WorkBuddy message 形态', () => {
  it('type=message + content[].text 计轮次', async () => {
    const s = await parseClaudeLikeFile(
      'workbuddy',
      file('g.jsonl', [
        { type: 'message', role: 'user', timestamp: TS1, content: [{ text: '审查仓库安全性' }] },
        { type: 'message', role: 'user', timestamp: TS2, content: [{ text: '再看一遍依赖' }] },
      ]),
    )
    expect(s.turns).toBe(2)
    expect(s.title).toBe('审查仓库安全性')
  })

  it('ai-title 只补标题，不算一轮', async () => {
    const s = await parseClaudeLikeFile(
      'workbuddy',
      file('h.jsonl', [
        { type: 'ai-title', title: '优化下载页' },
        { type: 'message', role: 'user', timestamp: TS1, content: [{ text: '改一下按钮' }] },
      ]),
    )
    expect(s.title).toBe('优化下载页')
    expect(s.turns).toBe(1)
  })
})
