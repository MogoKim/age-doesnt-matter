/**
 * 히어로 배너 교체 스크립트 — 기존 배너 전체 삭제 후 새 이미지로 등록
 * Usage: npx tsx scripts/replace-hero-banners.ts
 */
console.log('[WATCH] replace-hero-banners.ts 실행됨 —', new Date().toISOString(), '| 2주 모니터링 대상')
import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL })
const prisma = new PrismaClient({ adapter })

const BANNERS = [
  {
    filePath: 'assets/hero_banner/히어로 팝업_1.jpg',
    r2Key: `banners/hero-popup-1-${Date.now()}.jpg`,
    title: '히어로 배너 1',
    description: '우나어 소개',
    linkUrl: '/about',
    priority: 1,
  },
  {
    filePath: 'assets/hero_banner/히어로팝업_2.jpg',
    r2Key: `banners/hero-popup-2-${Date.now() + 1}.jpg`,
    title: '히어로 배너 2',
    description: '사는이야기',
    linkUrl: '/community/stories',
    priority: 2,
  },
] as const

function checkUrlAccessible(url: string): boolean {
  try {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}"`, {
      encoding: 'utf-8',
    }).trim()
    return result === '200'
  } catch {
    return false
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  히어로 배너 교체 스크립트 (1600×600)')
  console.log('═══════════════════════════════════════════════\n')

  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY?.trim()
  const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY?.trim()
  const BUCKET = (process.env.CLOUDFLARE_R2_BUCKET ?? 'unaeo-uploads').trim()
  const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim()

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY || !PUBLIC_URL) {
    console.error('❌ R2 env 미설정 확인')
    process.exit(1)
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  })
  console.log('✅ [Step 0] R2 env + S3Client 초기화 완료')

  // Step 1: 기존 배너 전체 삭제
  const deleted = await prisma.banner.deleteMany({})
  console.log(`✅ [Step 1] 기존 배너 ${deleted.count}개 삭제 완료`)

  const startDate = new Date()
  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + 1)

  for (const banner of BANNERS) {
    console.log(`\n─── ${banner.title} ───`)

    // Step 2: 파일 읽기
    const absPath = resolve(banner.filePath)
    const buffer = readFileSync(absPath)
    console.log(`✅ [Step 2] 파일 읽기: ${(buffer.length / 1024).toFixed(0)}KB`)

    // Step 3: R2 업로드
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: banner.r2Key,
      Body: buffer,
      ContentType: 'image/jpeg',
    }))
    const imageUrl = `${PUBLIC_URL}/${banner.r2Key}`
    console.log(`✅ [Step 3] R2 업로드: ${imageUrl}`)

    // Step 4: URL 접근성
    const ok = checkUrlAccessible(imageUrl)
    console.log(`${ok ? '✅' : '⚠️ '} [Step 4] URL 접근: ${ok ? '200 OK' : '확인 필요'}`)

    // Step 5: DB 저장
    const created = await prisma.banner.create({
      data: {
        title: banner.title,
        description: banner.description,
        imageUrl,
        linkUrl: banner.linkUrl,
        startDate,
        endDate,
        priority: banner.priority,
        isActive: true,
      },
    })
    console.log(`✅ [Step 5] DB 저장 완료 (id: ${created.id})`)
  }

  console.log('\n═══════════════════════════════════════════════')
  console.log('  ✅ 배너 교체 완료 — 홈페이지에서 확인하세요')
  console.log('═══════════════════════════════════════════════')
}

main()
  .catch(e => {
    console.error('❌ 오류:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
