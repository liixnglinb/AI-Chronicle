import { describe, expect, it } from 'vitest'
import { matchSession, normalizeQuery } from '../src/lib/search'
import type { SessionRecord } from '../src/types'

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'claude-code:1',
    tool: 'claude-code',
    toolName: 'Claude Code',
    toolColor: '#D97757',
    title: '重构下载页',
    project: 'voyra-site',
    projectPath: 'D:\\work\\voyra-site',
    start: 0,
    end: 0,
    turns: 1,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
    model: 'gpt-5-codex',
    hasTokens: false,
    artifacts: [{ path: 'D:\\work\\voyra-site\\src\\Landing.tsx', name: 'Landing.tsx' }],
    ...over,
  } as SessionRecord
}

describe('normalizeQuery', () => {
  it('去空白并转小写', () => {
    expect(normalizeQuery('  CoDeX ')).toBe('codex')
  })
})

describe('matchSession：六个可搜索字段一个都不能漏', () => {
  // 时间轴与命令面板以前只搜 4 个字段，模型名和产出文件名搜不到；
  // 这两条断言就是那次缺陷的守卫。
  it.each([
    ['标题', '重构'],
    ['项目名', 'voyra'],
    ['完整路径', 'd:\\work'],
    ['模型名', 'gpt-5-codex'],
    ['软件名', 'claude code'],
    ['产出文件名', 'landing.tsx'],
  ])('按%s命中', (_label, q) => {
    expect(matchSession(session(), q)).toBe(true)
  })

  it('空查询不过滤', () => {
    expect(matchSession(session(), '   ')).toBe(true)
  })

  it('命中不了就返回 false，不做模糊兜底', () => {
    expect(matchSession(session(), 'kubernetes')).toBe(false)
  })

  it('artifacts 缺失时不抛（老缓存里的会话可能没有产出）', () => {
    const bare = { ...session(), artifacts: undefined } as unknown as SessionRecord
    expect(() => matchSession(bare, 'landing')).not.toThrow()
    expect(matchSession(bare, 'landing')).toBe(false)
  })
})
