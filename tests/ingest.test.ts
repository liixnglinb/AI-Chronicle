import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// ingest.cjs 是 CommonJS 模块（Electron 主进程用），用 createRequire 直接加载
const require = createRequire(import.meta.url)
const { decodeDirProject, basenameOf, CACHE_VERSION } = require('../electron/ingest.cjs') as {
  decodeDirProject: (dirName: string) => string
  basenameOf: (p: string) => string
  CACHE_VERSION: number
}

describe('decodeDirProject', () => {
  it('还原新格式（盘符后单个横线）', () => {
    expect(decodeDirProject('c-Users-李星历-Desktop-每日使用日志')).toBe(
      'C:\\Users\\李星历\\Desktop\\每日使用日志',
    )
  })

  it('还原旧格式（盘符后两个横线）', () => {
    expect(decodeDirProject('C--Users-me-Desktop-proj')).toBe('C:\\Users\\me\\Desktop\\proj')
  })

  it('折叠连续横线，不产生空路径段', () => {
    expect(decodeDirProject('c--Users--me--proj')).toBe('C:\\Users\\me\\proj')
  })

  it('非 C 盘不还原（保持原样，避免误判）', () => {
    expect(decodeDirProject('d--Claude-code')).toBe('d--Claude-code')
  })

  it('只有一段的目录名不还原，避免把普通目录名当路径', () => {
    expect(decodeDirProject('c-x')).toBe('c-x')
    expect(decodeDirProject('my-project')).toBe('my-project')
    expect(decodeDirProject('a-b')).toBe('a-b')
  })

  it('空值返回空串', () => {
    expect(decodeDirProject('')).toBe('')
    expect(decodeDirProject(undefined as unknown as string)).toBe('')
  })
})

describe('basenameOf', () => {
  it('取最后一段并忽略结尾分隔符', () => {
    expect(basenameOf('C:\\Users\\me\\proj\\')).toBe('proj')
    expect(basenameOf('/home/u/proj')).toBe('proj')
  })

  it('无分隔符时原样返回', () => {
    expect(basenameOf('proj')).toBe('proj')
  })
})

describe('缓存版本', () => {
  it('解析逻辑变更后必须递增，否则旧缓存会返回旧结果', () => {
    expect(typeof CACHE_VERSION).toBe('number')
    expect(CACHE_VERSION).toBeGreaterThanOrEqual(3)
  })
})
