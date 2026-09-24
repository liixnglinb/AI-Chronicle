import fs from 'node:fs/promises'
import path from 'node:path'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = process.cwd()
const buildDirectory = path.join(root, 'build')
const sourceIcon = path.join(root, 'public', 'favicon.svg')
const pngPath = path.join(buildDirectory, 'icon.png')
const icoPath = path.join(buildDirectory, 'icon.ico')

await fs.mkdir(buildDirectory, { recursive: true })
await sharp(sourceIcon).resize(512, 512).png().toFile(pngPath)
const ico = await pngToIco(pngPath)
await fs.writeFile(icoPath, ico)

console.log(`Generated ${pngPath}`)
console.log(`Generated ${icoPath}`)
