import { describe, expect, it } from 'vitest'
import { computeUniqueSuffixes, projectDisplayName, toCrumbs, uniqueSuffix } from '../src/lib/paths'

describe('computeUniqueSuffixes', () => {
  it('无冲突时只取末段', () => {
    const result = computeUniqueSuffixes(['D:\\work\\alpha', 'D:\\work\\beta'])
    expect(result.get('D:/work/alpha')).toEqual(['alpha'])
    expect(result.get('D:/work/beta')).toEqual(['beta'])
  })

  it('Monorepo 同名子包自动延长后缀（packages/core vs apps/core）', () => {
    const result = computeUniqueSuffixes([
      'D:\\repo\\packages\\core',
      'D:\\repo\\apps\\core',
      'D:\\repo\\packages\\ui',
    ])
    // 两个 core 必须拿到不同的后缀
    expect(result.get('D:/repo/packages/core')).toEqual(['packages', 'core'])
    expect(result.get('D:/repo/apps/core')).toEqual(['apps', 'core'])
    // ui 不冲突，仍只取末段
    expect(result.get('D:/repo/packages/ui')).toEqual(['ui'])
  })

  it('三层同名逐级延长直到唯一', () => {
    const result = computeUniqueSuffixes([
      'C:\\a\\x\\src\\core',
      'C:\\b\\x\\src\\core',
      'C:\\a\\y\\src\\core',
    ])
    const a = result.get('C:/a/x/src/core')
    const b = result.get('C:/b/x/src/core')
    const c = result.get('C:/a/y/src/core')
    expect(a?.at(-1)).toBe('core')
    expect(new Set([a?.join('/'), b?.join('/'), c?.join('/')]).size).toBe(3)
  })

  it('完全相同的路径退化为全部段（已无处可缩）', () => {
    const result = computeUniqueSuffixes(['D:\\same\\path', 'D:\\same\\path'])
    expect(result.get('D:/same/path')).toEqual(['D:', 'same', 'path'])
  })

  it('长度不一的同尾路径也能区分', () => {
    const result = computeUniqueSuffixes(['D:\\a\\core', 'D:\\b\\sub\\core'])
    expect(result.get('D:/a/core')).toEqual(['a', 'core'])
    expect(result.get('D:/b/sub/core')).toEqual(['sub', 'core'])
  })

  it('空输入返回空 Map', () => {
    expect(computeUniqueSuffixes([]).size).toBe(0)
  })
})

describe('uniqueSuffix', () => {
  it('把兄弟路径纳入判定', () => {
    expect(uniqueSuffix('D:\\repo\\packages\\core', ['D:\\repo\\apps\\core'])).toEqual([
      'packages',
      'core',
    ])
  })

  it('无兄弟时只取末段', () => {
    expect(uniqueSuffix('D:\\repo\\core', [])).toEqual(['core'])
  })
})

describe('toCrumbs', () => {
  it('拆出祖先目录与终端项目名', () => {
    const crumbs = toCrumbs('D:\\repo\\packages\\core', ['D:\\repo\\apps\\core'])
    expect(crumbs.leaf).toBe('core')
    expect(crumbs.ancestors).toEqual(['packages'])
  })

  it('同名时祖先可多段，保留最内 3 段', () => {
    const crumbs = toCrumbs('D:\\a\\b\\c\\d\\e\\proj', ['D:\\x\\y\\c\\d\\e\\proj'])
    expect(crumbs.leaf).toBe('proj')
    expect(crumbs.ancestors).toEqual(['c', 'd', 'e'])
  })

  it('无冲突时只有终端名，没有祖先', () => {
    const crumbs = toCrumbs('D:\\repo\\solo')
    expect(crumbs.leaf).toBe('solo')
    expect(crumbs.ancestors).toEqual([])
  })

  it('单段路径没有祖先', () => {
    const crumbs = toCrumbs('workspace')
    expect(crumbs.leaf).toBe('workspace')
    expect(crumbs.ancestors).toEqual([])
  })

  it('盘符段不进入面包屑正文', () => {
    const crumbs = toCrumbs('D:\\solo', [])
    expect(crumbs.ancestors).not.toContain('D:')
  })
})

describe('projectDisplayName', () => {
  it('拼接祖先与终端名，Monorepo 下不再撞名', () => {
    const siblings = ['D:\\repo\\packages\\core', 'D:\\repo\\apps\\core']
    expect(projectDisplayName('D:\\repo\\packages\\core', siblings)).toBe('packages / core')
    expect(projectDisplayName('D:\\repo\\apps\\core', siblings)).toBe('apps / core')
  })

  it('无祖先时直接返回目录名', () => {
    expect(projectDisplayName('D:\\solo', [])).toBe('solo')
  })
})
