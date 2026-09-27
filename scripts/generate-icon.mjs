import fs from 'node:fs/promises'
import path from 'node:path'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = process.cwd()
const buildDirectory = path.join(root, 'build')
const sourceIcon = path.join(root, 'public', 'favicon.svg')
const pngPath = path.join(buildDirectory, 'icon.png')
const icoPath = path.join(buildDirectory, 'icon.ico')

// 高清渲染：先以 1024px 栅格化，再用 lanczos3 降采样 + 适度锐化，
// 保证 16/32px 小尺寸下星芒与轨迹边缘干净不发糊。
const MASTER = 1024
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

await fs.mkdir(buildDirectory, { recursive: true })

const master = await sharp(sourceIcon, { density: 1200 })
  .resize(MASTER, MASTER)
  .png()
  .toBuffer()

await sharp(master)
  .resize(512, 512, { kernel: 'lanczos3' })
  .png()
  .toFile(pngPath)

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

console.log(`Generated ${pngPath} (512px, lanczos3)`)
console.log(`Generated ${icoPath} (${ICO_SIZES.join('/')}, sharpened)`)
