/**
 * 매거진 썸네일 복구 스크립트
 *
 * 문제: thumbnail-generator(Playwright)가 CI에서 실패 → thumbnailUrl이 null
 *       하지만 히어로 이미지(DALL-E → R2)는 content HTML 안에 존재
 *
 * 해결: content HTML의 첫 번째 <img src="..."> R2 URL을 thumbnailUrl로 설정
 *
 * 실행: npx tsx scripts/fix-magazine-thumbnails.ts
 * 드라이런: npx tsx scripts/fix-magazine-thumbnails.ts --dry-run
 */

import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch { /* 파일 없으면 무시 */ }
}
loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

// agents/core/db.ts와 동일한 연결 방식 — DATABASE_URL(session pooler) 우선
const dbUrl = new URL(process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '')
const pool = new Pool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port, 10) || 5432,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const dryRun = process.argv.includes('--dry-run')

/** content HTML에서 첫 번째 R2 이미지 URL 추출 */
function extractFirstR2Image(html: string): string | null {
  const imgMatch = html.match(/<img\s[^>]*src="([^"]+)"/)
  if (!imgMatch) return null
  const url = imgMatch[1]
  // R2 URL인지 확인
  if (url.includes('.r2.dev') || url.includes('.r2.cloudflarestorage.com')) {
    return url
  }
  return null
}

async function main() {
  console.log(`[FixMagazineThumbnails] ${dryRun ? '드라이런 모드' : '실행 모드'}`)

  // thumbnailUrl이 null인 매거진 검색
  const posts = await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      thumbnailUrl: null,
    },
    select: { id: true, title: true, content: true },
  })

  console.log(`[FixMagazineThumbnails] thumbnailUrl 없는 매거진: ${posts.length}건`)

  let fixedCount = 0
  let noImageCount = 0

  for (const post of posts) {
    const imageUrl = extractFirstR2Image(post.content)

    if (!imageUrl) {
      console.log(`  ⚠ "${post.title}" (${post.id}) — content에 R2 이미지 없음`)
      noImageCount++
      continue
    }

    console.log(`  ✅ "${post.title}" (${post.id})`)
    console.log(`     → ${imageUrl.slice(0, 80)}...`)

    if (!dryRun) {
      await prisma.post.update({
        where: { id: post.id },
        data: { thumbnailUrl: imageUrl },
      })
    }
    fixedCount++
  }

  console.log(`\n[FixMagazineThumbnails] 결과:`)
  console.log(`  ${dryRun ? '수정 예정' : '수정 완료'}: ${fixedCount}건`)
  console.log(`  R2 이미지 없음: ${noImageCount}건`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[FixMagazineThumbnails] 오류:', err)
  await prisma.$disconnect()
  process.exit(1)
})
