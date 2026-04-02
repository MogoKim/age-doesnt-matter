/**
 * 매거진 [IMAGE_PROMPT: ...] 텍스트 정리 스크립트
 *
 * 문제: magazine-generator가 AI 프롬프트 텍스트를 추출만 하고 content에서 제거하지 않아
 *       본문 끝에 영어 이미지 프롬프트가 노출됨
 *
 * 실행: npx tsx scripts/fix-magazine-image-prompt.ts
 * 드라이런: npx tsx scripts/fix-magazine-image-prompt.ts --dry-run
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

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const dryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`[FixMagazineImagePrompt] ${dryRun ? '드라이런 모드' : '실행 모드'}`)

  // MAGAZINE 타입 + content에 [IMAGE_PROMPT: 포함된 글 검색
  const posts = await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      content: { contains: '[IMAGE_PROMPT:' },
    },
    select: { id: true, title: true, content: true },
  })

  console.log(`[FixMagazineImagePrompt] 대상 매거진: ${posts.length}건`)

  let fixedCount = 0
  for (const post of posts) {
    const cleaned = post.content.replace(/\[IMAGE_PROMPT:[^\]]*\]/g, '').trim()
    if (cleaned === post.content) continue

    console.log(`  - "${post.title}" (${post.id})`)

    if (!dryRun) {
      await prisma.post.update({
        where: { id: post.id },
        data: { content: cleaned },
      })
    }
    fixedCount++
  }

  console.log(`[FixMagazineImagePrompt] ${dryRun ? '수정 예정' : '수정 완료'}: ${fixedCount}건`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[FixMagazineImagePrompt] 오류:', err)
  await prisma.$disconnect()
  process.exit(1)
})
