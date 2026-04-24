/**
 * PWA 아이콘 생성 스크립트
 * 실행: npx tsx scripts/generate-icons.ts
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const SVG = readFileSync(resolve('public/icons/icon.svg'))

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

async function main() {
  for (const size of SIZES) {
    const png = await sharp(SVG)
      .resize(size, size)
      .png()
      .toBuffer()

    writeFileSync(resolve(`public/icons/icon-${size}x${size}.png`), png)
    console.log(`Generated icon-${size}x${size}.png`)
  }

  // Apple touch icon
  const apple = await sharp(SVG).resize(180, 180).png().toBuffer()
  writeFileSync(resolve('public/apple-touch-icon.png'), apple)
  console.log('Generated apple-touch-icon.png')

  // Favicon
  const favicon = await sharp(SVG).resize(32, 32).png().toBuffer()
  writeFileSync(resolve('public/favicon.png'), favicon)
  console.log('Generated favicon.png')
}

main().catch(console.error)
