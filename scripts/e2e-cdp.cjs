// E2E 验证驱动：通过 CDP 控制运行中的 AI轨迹（截图/取元素/鼠标事件）
// 用法：
//   node scripts/e2e-cdp.cjs shot <输出.png>      截图
//   node scripts/e2e-cdp.cjs eval "<js>"          执行 JS 并打印返回值
//   node scripts/e2e-cdp.cjs move <x> <y>         鼠标移动（触发 hover）
//   node scripts/e2e-cdp.cjs click <x> <y>        鼠标点击
//   node scripts/e2e-cdp.cjs badge                输出更新框位置与状态
'use strict'
const fs = require('node:fs')

const CDP_HTTP = 'http://127.0.0.1:9222'

async function getPageWs() {
  const res = await fetch(`${CDP_HTTP}/json/list`)
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) throw new Error('未找到页面 target')
  return page.webSocketDebuggerUrl
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onopen = () =>
      resolve({
        send: (method, params) =>
          new Promise((res2, rej2) => {
            id += 1
            pending.set(id, { res: res2, rej: rej2 })
            ws.send(JSON.stringify({ id, method, params }))
          }),
        close: () => ws.close(),
      })
    ws.onerror = (e) => reject(new Error('WS 错误'))
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(msg.error.message))
        else res(msg.result)
      }
    }
  })
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const ws = await connect(await getPageWs())

  if (cmd === 'shot') {
    const { data } = await ws.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(args[0], Buffer.from(data, 'base64'))
    console.log('已保存', args[0])
  } else if (cmd === 'eval') {
    const { result } = await ws.send('Runtime.evaluate', {
      expression: args[0],
      returnByValue: true,
      awaitPromise: true,
    })
    console.log(typeof result.value === 'string' ? result.value : JSON.stringify(result.value))
  } else if (cmd === 'move' || cmd === 'click') {
    const type = cmd === 'move' ? 'mouseMoved' : null
    await ws.send('Input.dispatchMouseEvent', { type, x: Number(args[0]), y: Number(args[1]) })
    if (cmd === 'click') {
      await ws.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: Number(args[0]),
        y: Number(args[1]),
        button: 'left',
        clickCount: 1,
      })
      await ws.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: Number(args[0]),
        y: Number(args[1]),
        button: 'left',
        clickCount: 1,
      })
    }
    console.log('OK')
  } else if (cmd === 'badge') {
    const { result } = await ws.send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('.update-badge')
        if (!el) return JSON.stringify({ present: false })
        const r = el.getBoundingClientRect()
        return JSON.stringify({
          present: true,
          text: el.textContent,
          ready: el.classList.contains('update-badge-ready'),
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
        })
      })()`,
      returnByValue: true,
    })
    console.log(result.value)
  } else {
    console.log('未知命令')
  }
  ws.close()
  process.exit(0)
}

main().catch((err) => {
  console.error('E2E_FAIL', String(err && err.message))
  process.exit(1)
})
