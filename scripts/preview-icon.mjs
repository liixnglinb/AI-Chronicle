// 图标方案预览：把目录下的 SVG 栅格化成
//   1) 256px 大图，用于看整体观感
//   2) 16/24/32/48/64 并排条（深色底 + 浅色底各一条），用于检查小尺寸下的辨识度
//
// 用法：node scripts/preview-icon.mjs <svg 目录> [输出目录]
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const inputDir = process.argv[2]
const outDir = process.argv[3] ?? inputDir
if (!inputDir) {
  console.error('用法：node scripts/preview-icon.mjs <svg 目录> [输出目录]')
  process.exit(1)
}

const MASTER = 1024
const SIZES = [16, 24, 32, 48, 64]
const GAP = 12
const PAD = 16
const BAND = Math.max(...SIZES)

const BACKGROUNDS = {
  dark: { r: 0x1b, g: 0x1d, b: 0x20, alpha: 1 },
  light: { r: 0xf2, g: 0xf4, b: 0xf5, alpha: 1 },
}

await fs.mkdir(outDir, { recursive: true })

const files = (await fs.readdir(inputDir)).filter((name) => name.endsWith('.svg')).sort()
if (files.length === 0) {
  console.error(`目录中没有 SVG：${inputDir}`)
  process.exit(1)
}

for (const file of files) {
  const svgPath = path.join(inputDir, file)
  const name = path.basename(file, '.svg')
  const master = await sharp(svgPath, { density: 1200 }).resize(MASTER, MASTER).png().toBuffer()

  await sharp(master)
    .resize(256, 256, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(outDir, `${name}-256.png`))

  for (const [theme, background] of Object.entries(BACKGROUNDS)) {
    let x = PAD
    const composites = []
    for (const size of SIZES) {
      const buf = await sharp(master).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
      composites.push({
        input: buf,
        left: x,
        top: PAD + Math.round((BAND - size) / 2),
      })
      x += size + GAP
    }
    const width = x - GAP + PAD
    const height = BAND + PAD * 2
    await sharp({ create: { width, height, channels: 4, background } })
      .composite(composites)
      .png()
      .toFile(path.join(outDir, `${name}-strip-${theme}.png`))
  }

  console.log(`预览完成：${name}`)
}
