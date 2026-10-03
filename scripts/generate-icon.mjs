import fs from 'node:fs/promises'
import path from 'node:path'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = process.cwd()
const buildDirectory = path.join(root, 'build')
const sourceIcon = path.join(root, 'public', 'favicon.svg')
const traySource = path.join(root, 'public', 'tray.svg')
const pngPath = path.join(buildDirectory, 'icon.png')
const icoPath = path.join(buildDirectory, 'icon.ico')

// 高清渲染：先以 1024px 栅格化，再用 lanczos3 降采样 + 适度锐化，
// 保证 16/32px 小尺寸下轨道与节点边缘干净不发糊。
const MASTER = 1024
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
// 托盘字形要覆盖 Windows 100%~200% DPI（16/20/24/32）以及「显示隐藏图标」浮层（48）
const TRAY_SIZES = [16, 20, 24, 32, 48]

await fs.mkdir(buildDirectory, { recursive: true })

const master = await sharp(sourceIcon, { density: 1200 }).resize(MASTER, MASTER).png().toBuffer()

await sharp(master).resize(512, 512, { kernel: 'lanczos3' }).png().toFile(pngPath)

const sized = []
for (const size of ICO_SIZES) {
  const buf = await sharp(master)
    .resize(size, size, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.6, m1: 0.4, m2: 1.2 })
    .png()
    .toBuffer()
  sized.push(buf)
}

const ico = await pngToIco(sized)
await fs.writeFile(icoPath, ico)

// 托盘：应用图标是「深色方块 + 深色日志页」，直接缩小到 16px 放进托盘会糊成一团黑，
// 所以托盘改用 public/tray.svg —— 透明底的单色日志页字形。
// 深色任务栏用浅色字形（tray-on-dark），浅色任务栏用深色字形（tray-on-light），
// 两套只差一次颜色互换，避免在浅色任务栏上「白字压白底」。
const traySvg = await fs.readFile(traySource, 'utf8')
const invertedTraySvg = traySvg.replace(/#(ffffff|0b0c0d)/gi, (match) =>
  match.toUpperCase() === '#FFFFFF' ? '#0B0C0D' : '#FFFFFF',
)
if (invertedTraySvg === traySvg) {
  throw new Error('public/tray.svg 里没找到 #FFFFFF / #0B0C0D，托盘深色版无法生成')
}

async function buildTray(svg, name) {
  const trayMaster = await sharp(Buffer.from(svg), { density: 1200 })
    .resize(MASTER, MASTER)
    .png()
    .toBuffer()
  await sharp(trayMaster)
    .resize(32, 32, { kernel: 'lanczos3' })
    .sharpen({ sigma: 0.5, m1: 0.4, m2: 1.1 })
    .png()
    .toFile(path.join(buildDirectory, `${name}.png`))

  const layers = []
  for (const size of TRAY_SIZES) {
    layers.push(
      await sharp(trayMaster)
        .resize(size, size, { kernel: 'lanczos3' })
        .sharpen({ sigma: 0.5, m1: 0.4, m2: 1.1 })
        .png()
        .toBuffer(),
    )
  }
  await fs.writeFile(path.join(buildDirectory, `${name}.ico`), await pngToIco(layers))
}

await buildTray(traySvg, 'tray-on-dark')
await buildTray(invertedTraySvg, 'tray-on-light')

console.log(`Generated ${pngPath} (512px, lanczos3)`)
console.log(`Generated ${icoPath} (${ICO_SIZES.join('/')}, sharpened)`)
console.log(`Generated tray-on-dark/tray-on-light (.png 32px + .ico ${TRAY_SIZES.join('/')})`)
