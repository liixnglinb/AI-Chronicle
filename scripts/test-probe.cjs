// 独立验证更新源测速（Electron net 模块）
'use strict'
const { app } = require('electron')
const RELEASE_BASE = 'https://github.com/liixnglinb/AI-Chronicle/releases/latest/download/'
const FEED_CANDIDATES = [
  { id: 'github', label: 'GitHub 直连', base: RELEASE_BASE },
  { id: 'gh-proxy', label: 'gh-proxy 镜像', base: `https://gh-proxy.com/${RELEASE_BASE}` },
  { id: 'ghfast', label: 'ghfast.top 镜像', base: `https://ghfast.top/${RELEASE_BASE}` },
]
const ALLOWED = new Set(['github.com', 'gh-proxy.com', 'ghfast.top'])

function probe(rawUrl, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now()
    let settled = false
    const done = (r) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'https:' || !ALLOWED.has(parsed.hostname)) {
        done({ ok: false, reason: '白名单外' })
        return
      }
      const req = require('electron').net.request({ method: 'GET', url: parsed.href })
      const timer = setTimeout(() => {
        done({ ok: false, reason: '超时' })
        try {
          req.abort()
        } catch {}
      }, timeoutMs)
      req.on('response', (res) => {
        clearTimeout(timer)
        res.resume()
        done({ ok: res.statusCode < 400, status: res.statusCode, ms: Date.now() - started })
      })
      req.on('error', (e) => {
        clearTimeout(timer)
        done({ ok: false, reason: String(e && e.message).slice(0, 40) })
      })
      req.end()
    } catch (e) {
      done({ ok: false, reason: String(e).slice(0, 40) })
    }
  })
}

app.whenReady().then(async () => {
  for (const c of FEED_CANDIDATES) {
    const r = await probe(c.base + 'latest.yml', 6000)
    console.log('PROBE', c.id, JSON.stringify(r))
  }
  app.exit(0)
})
