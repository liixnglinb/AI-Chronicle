// 项目路径消歧：解决 Monorepo / 多层级微服务下的项目名撞名问题。
//
// 背景：`D:\repo\packages\core` 与 `D:\repo\apps\core` 的末两段都是 `core`。
// 只按「取末尾两段」缩写会让两个不同项目在界面上显示成同一个名字，
// 观测台失去意义。这里按「同组内唯一后缀」规则逐级延长，直到不再冲突。

export interface PathCrumbs {
  /** 祖先目录段（由外到内），已按需截断 */
  ancestors: string[]
  /** 终端项目名，始终存在 */
  leaf: string
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function segments(value: string): string[] {
  return normalize(value).split('/').filter(Boolean)
}

/** 盘符单独保留，避免把 `C:` 混进面包屑正文 */
function isDriveSegment(seg: string): boolean {
  return /^[a-zA-Z]:$/.test(seg)
}

/**
 * 为一组项目路径计算各自唯一的最短后缀。
 * 返回 Map<原始路径, 段数组>，段数组的最后一段即项目名。
 *
 * 算法：从 1 段开始，若该后缀在组内唯一则停止；否则加长一段。
 * 全组都冲突时退化为完整路径（此时已无处可缩）。
 */
export function computeUniqueSuffixes(paths: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const normalized = paths.map((p) => normalize(p))
  const segLists = normalized.map((p) => segments(p))

  // 预先算好每个后缀长度是否唯一，避免 O(n²) 的重复比较
  const uniquenessCache = new Map<string, boolean>()

  const isUnique = (index: number, depth: number): boolean => {
    const cacheKey = `${index}:${depth}`
    const cached = uniquenessCache.get(cacheKey)
    if (cached !== undefined) return cached

    const segs = segLists[index]
    const take = Math.min(depth, segs.length)
    const suffix = segs.slice(segs.length - take).join('/')
    let unique = true
    for (let i = 0; i < segLists.length; i++) {
      if (i === index) continue
      const other = segLists[i]
      const otherTake = Math.min(depth, other.length)
      if (other.slice(other.length - otherTake).join('/') === suffix) {
        unique = false
        break
      }
    }
    uniquenessCache.set(cacheKey, unique)
    return unique
  }

  normalized.forEach((path, index) => {
    const segs = segLists[index]
    let depth = 1
    while (depth < segs.length && !isUnique(index, depth)) depth += 1
    result.set(path, segs.slice(segs.length - depth))
  })

  return result
}

/**
 * 单条路径的消歧后缀（组内只有它自己时就是末段）。
 * siblings 里若包含自身会被去重 —— 否则自己和自己「冲突」，
 * 后缀会被无意义地一路延长到整条路径。
 */
export function uniqueSuffix(path: string, siblings: string[]): string[] {
  const target = normalize(path)
  const others = siblings.map(normalize).filter((p) => p !== target)
  return computeUniqueSuffixes([target, ...others]).get(target) ?? segments(target)
}

/**
 * 把路径切成「祖先目录 + 终端项目名」，供面包屑渲染。
 *
 * 祖先 = 消歧时用到的那些段（多一段不多一段，刚好够区分同名项目）。
 * 超过 3 段时只保留最内的 3 段 —— 再往外已经没有定位价值，
 * 完整路径始终由 title 属性兜底，不依赖视觉截断。
 * 盘符段（`C:`）不进入面包屑正文，它不是目录名。
 */
export function toCrumbs(path: string, siblings: string[] = []): PathCrumbs {
  const suffix = uniqueSuffix(path, siblings)
  const leaf = suffix[suffix.length - 1] ?? path
  const MAX_ANCESTORS = 3
  const ancestors = suffix.slice(0, -1).filter((seg) => !isDriveSegment(seg))
  return {
    ancestors: ancestors.length > MAX_ANCESTORS ? ancestors.slice(-MAX_ANCESTORS) : ancestors,
    leaf,
  }
}

/**
 * 生成可读的项目显示名：祖先段 + 终端名，形如 `packages / core`。
 * 祖先为空时（路径只有一段）直接返回终端名。
 */
export function projectDisplayName(path: string, siblings: string[] = []): string {
  const { ancestors, leaf } = toCrumbs(path, siblings)
  return ancestors.length ? `${ancestors.join(' / ')} / ${leaf}` : leaf
}

/** 判断路径是否为盘符根（如 `C:`），这类段不进入面包屑正文 */
export function isRootSegment(seg: string): boolean {
  return isDriveSegment(seg)
}
