import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// ingest.cjs 是 CommonJS 模块（Electron 主进程用），用 createRequire 直接加载
const require = createRequire(import.meta.url)
const {
  decodeDirProject,
  basenameOf,
  CACHE_VERSION,
  IngestCache,
  parseCodexFile,
  isInjectedTitle,
} = require('../electron/ingest.cjs') as {
  decodeDirProject: (dirName: string) => string
  basenameOf: (p: string) => string
  CACHE_VERSION: number
  IngestCache: new (cachePath: string, crypto?: unknown) => IngestCacheLike
  parseCodexFile: (filePath: string) => Promise<CodexSession>
  isInjectedTitle: (text: string) => boolean
}

interface CodexSession {
  id: string
  title: string
  turns: number
  start: number | null
  end: number | null
  projectPath: string
}

interface IngestCacheLike {
  cachePath: string
  data: { v: number; files: Record<string, { m: number; s: number; session: unknown }> }
  dirty: boolean
  load(): void
  get(filePath: string, mtimeMs: number, size: number): unknown | null
  put(filePath: string, mtimeMs: number, size: number, session: unknown): void
  trim(): void
  save(): void
}

describe('decodeDirProject', () => {
  it('还原新格式（盘符后单个横线）', () => {
    // 目录段本身不能含横线：编码格式无法区分"分隔用的横线"和"名字里的横线"
    expect(decodeDirProject('c-Users-demo-Desktop-workspace')).toBe(
      'C:\\Users\\demo\\Desktop\\workspace',
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

// ---------------------------------------------------------------- IngestCache
// 缓存文件在本机 userData 里，会被手滑编辑、被安全软件截断、也会遇到系统钥匙串重置。
// 这些情况的唯一正确结果都是「当作没有缓存，全量重扫」，绝不能抛异常把采集整体打挂。
const fakeCrypto = {
  encrypt: (text: string) => Buffer.from(text, 'utf8').toString('base64'),
  decrypt: (blob: string) => Buffer.from(blob, 'base64').toString('utf8'),
}

const tempDirs: string[] = []

function cacheFile(name = 'chronicle-ingest-cache.json') {
  const dir = mkdtempSync(join(tmpdir(), 'chronicle-cache-'))
  tempDirs.push(dir)
  return join(dir, name)
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

describe('IngestCache 读到坏数据必须退回全量重扫', () => {
  it('缓存文件不存在（首次运行）→ 空缓存，不抛', () => {
    const cache = new IngestCache(cacheFile(), fakeCrypto)
    expect(cache.get('C:\\data\\a.json', 1, 10)).toBeNull()
    expect(Object.keys(cache.data.files)).toHaveLength(0)
  })

  it('缓存文件被截断成坏 JSON → 空缓存，不抛', () => {
    const file = cacheFile()
    writeFileSync(file, '{"v":3,"files":{"a":', 'utf8')
    const cache = new IngestCache(file, fakeCrypto)
    expect(cache.get('a', 1, 1)).toBeNull()
    expect(Object.keys(cache.data.files)).toHaveLength(0)
  })

  it('密文但没有解密能力（钥匙串不可用）→ 空缓存，不抛', () => {
    const file = cacheFile()
    const plain = new IngestCache(file, fakeCrypto)
    plain.put('C:\\data\\a.json', 100, 20, { id: 's1' })
    plain.save()
    const orphan = new IngestCache(file)
    expect(orphan.get('C:\\data\\a.json', 100, 20)).toBeNull()
  })

  it('解密过程抛错（系统钥匙串重置）→ 空缓存，不抛', () => {
    const file = cacheFile()
    const bootstrapper = {
      encrypt: (t: string) => Buffer.from(t, 'utf8').toString('base64'),
      decrypt: () => 'x',
    }
    const seed = new IngestCache(file, bootstrapper)
    seed.put('C:\\data\\a.json', 100, 20, { id: 's1' })
    seed.save()
    const broken = {
      encrypt: bootstrapper.encrypt,
      decrypt: () => {
        throw new Error('safeStorage  unavailable')
      },
    }
    const cache = new IngestCache(file, broken)
    expect(cache.get('C:\\data\\a.json', 100, 20)).toBeNull()
  })

  it('缓存版本与当前解析逻辑不一致 → 空缓存，不抛', () => {
    const file = cacheFile()
    writeFileSync(
      file,
      JSON.stringify({
        v: CACHE_VERSION - 1,
        files: { a: { m: 1, s: 1, session: { id: 'old' } } },
      }),
      'utf8',
    )
    const cache = new IngestCache(file, fakeCrypto)
    expect(cache.get('a', 1, 1)).toBeNull()
    expect(Object.keys(cache.data.files)).toHaveLength(0)
  })

  it('files 字段不是对象（被外部改写）→ 读取仍然不抛', () => {
    const file = cacheFile()
    writeFileSync(file, JSON.stringify({ v: CACHE_VERSION, files: 'not-an-object' }), 'utf8')
    const cache = new IngestCache(file, fakeCrypto)
    expect(cache.get('a', 1, 1)).toBeNull()
  })
})

describe('IngestCache 正常读写', () => {
  it('mtime 或 size 任一变化都必须判定为未命中（否则改动过的会话会被当成旧数据）', () => {
    const cache = new IngestCache(cacheFile(), fakeCrypto)
    cache.put('C:\\data\\a.json', 100, 20, { id: 's1' })
    expect(cache.get('C:\\data\\a.json', 100, 20)).toEqual({ id: 's1' })
    expect(cache.get('C:\\data\\a.json', 101, 20)).toBeNull()
    expect(cache.get('C:\\data\\a.json', 100, 21)).toBeNull()
  })

  it('加密往返：重新实例化后命中原有条目', () => {
    const file = cacheFile()
    const first = new IngestCache(file, fakeCrypto)
    first.put('C:\\data\\a.json', 100, 20, { id: 's1' })
    first.save()
    const second = new IngestCache(file, fakeCrypto)
    expect(second.get('C:\\data\\a.json', 100, 20)).toEqual({ id: 's1' })
  })

  it('落盘文件里不能出现明文路径（缓存含工作目录，属于本机隐私）', () => {
    const file = cacheFile()
    const cache = new IngestCache(file, fakeCrypto)
    cache.put('C:\\Users\\秘密用户\\Desktop\\内部项目', 1, 1, { id: 's1' })
    cache.save()
    const raw = readFileSync(file, 'utf8')
    expect(raw).not.toContain('秘密用户')
    expect(raw).not.toContain('内部项目')
    expect(JSON.parse(raw).enc).toBe(true)
  })

  it('save 用临时文件再改名，不留 .tmp 残骸', () => {
    const file = cacheFile()
    const cache = new IngestCache(file, fakeCrypto)
    cache.put('a', 1, 1, { id: 's1' })
    cache.save()
    expect(() => readFileSync(file + '.tmp', 'utf8')).toThrow()
    expect(cache.dirty).toBe(false)
  })

  it('未变化时 save 不写盘（dirty=false 直接返回）', () => {
    const file = cacheFile()
    const cache = new IngestCache(file, fakeCrypto)
    cache.put('a', 1, 1, { id: 's1' })
    cache.save()
    const before = readFileSync(file, 'utf8')
    cache.save()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('条目超过上限时按 mtime 淘汰最旧的，而不是无限增长', () => {
    const cache = new IngestCache(cacheFile(), fakeCrypto)
    // 直接灌到阈值前一条，再走 put：避免测试自己造 12000 次 Object.keys
    for (let i = 0; i < 11_999; i += 1) {
      cache.data.files[`C:\\data\\f${i}.json`] = { m: i, s: 10, session: { id: `s${i}` } }
    }
    cache.put('C:\\data\\f11999.json', 11_999, 10, { id: 's11999' })
    cache.put('C:\\data\\f12000.json', 12_000, 10, { id: 's12000' })
    expect(Object.keys(cache.data.files)).toHaveLength(6000)
    expect(cache.get('C:\\data\\f12000.json', 12_000, 10)).toEqual({ id: 's12000' })
    expect(cache.get('C:\\data\\f0.json', 0, 10)).toBeNull()
  })

  it('写盘失败（目录不可写）不影响本次采集', () => {
    const cache = new IngestCache(join(cacheFile(), 'not-a-dir', 'cache.json'), fakeCrypto)
    cache.put('a', 1, 1, { id: 's1' })
    expect(() => cache.save()).not.toThrow()
    expect(cache.get('a', 1, 1)).toEqual({ id: 's1' })
  })
})

// ---------------------------------------------------------------- Codex 轮次与标题
const line = (obj: unknown) => JSON.stringify(obj)
const META = {
  type: 'session_meta',
  timestamp: '2026-10-05T01:00:00.000Z',
  payload: { session_id: 'sess-1', cwd: 'D:\\work\\demo' },
}
const eventUser = (text: string, ts: string) =>
  line({ type: 'event_msg', timestamp: ts, payload: { type: 'user_message', message: text } })
const itemUser = (text: string, ts: string) =>
  line({
    type: 'response_item',
    timestamp: ts,
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  })

function codexFile(name: string, lines: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'chronicle-codex-'))
  tempDirs.push(dir)
  const file = join(dir, name)
  writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}

describe('parseCodexFile 轮次口径', () => {
  it('event_msg 形态：每条 user_message 计一轮', async () => {
    const s = await parseCodexFile(
      codexFile('a.jsonl', [
        line(META),
        eventUser('第一条指令', '2026-10-05T01:01:00.000Z'),
        eventUser('第二条指令', '2026-10-05T01:02:00.000Z'),
      ]),
    )
    expect(s.turns).toBe(2)
    expect(s.title).toBe('第一条指令')
  })

  it('只写 response_item 的 rollout 也必须计轮次（以前是有标题却 0 轮）', async () => {
    const s = await parseCodexFile(
      codexFile('b.jsonl', [
        line(META),
        itemUser('读取网站卡片信息', '2026-10-05T01:01:00.000Z'),
        itemUser('再优化一下按钮', '2026-10-05T01:02:00.000Z'),
      ]),
    )
    expect(s.title).toBe('读取网站卡片信息')
    expect(s.turns).toBe(2)
  })

  it('两种形态同时记录同一轮时不得翻倍', async () => {
    const s = await parseCodexFile(
      codexFile('c.jsonl', [
        line(META),
        itemUser('第一条指令', '2026-10-05T01:01:00.000Z'),
        eventUser('第一条指令', '2026-10-05T01:01:00.000Z'),
        itemUser('第二条指令', '2026-10-05T01:02:00.000Z'),
        eventUser('第二条指令', '2026-10-05T01:02:00.000Z'),
      ]),
    )
    expect(s.turns).toBe(2)
  })

  it('注入块不能当标题，标题要落到后面真正的人类输入', async () => {
    const s = await parseCodexFile(
      codexFile('d.jsonl', [
        line(META),
        itemUser(
          '## ⛔⛔⛔ 重试任务（最高优先级，必须先读这一段） 上一次执行没有产出',
          '2026-10-05T01:01:00.000Z',
        ),
        itemUser('帮我把下载页按钮改圆', '2026-10-05T01:02:00.000Z'),
      ]),
    )
    expect(s.title).toBe('帮我把下载页按钮改圆')
  })
})

describe('isInjectedTitle', () => {
  it.each([
    ['<environment_context>…', '标签开头'],
    ['## ⛔⛔⛔ 重试任务', '工具重试横幅'],
    ['# ⛔ 优先指令', '优先指令横幅'],
    ['## 本轮运行规则来源', '技能注入'],
    ['## 本轮作用域铁律', '作用域铁律'],
    ['# Files mentioned by the user:', 'Codex 文件清单前言'],
    ['', '空串'],
  ])('判为注入：%s', (text) => {
    expect(isInjectedTitle(text)).toBe(true)
  })

  it('用户自己写的 markdown 提示词不算注入（不能泛化按 # 判掉）', () => {
    expect(isInjectedTitle('# 任务说明（用户原始输入，一切判断的最终依据） 写一份周报')).toBe(false)
    expect(isInjectedTitle('你现在读取我网站里边所有卡片的信息')).toBe(false)
  })
})
