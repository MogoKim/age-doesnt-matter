/**
 * 히어로 배너 2개 R2 업로드 + DB 등록
 * Usage: npx tsx scripts/upload-hero-banners.ts
 *
 * 파이프라인:
 *   로컬 파일 읽기 → uploadToR2() (서버→R2, CORS 없음) → curl 접근성 확인 → Prisma Banner 생성
 */
console.log('[WATCH] upload-hero-banners.ts 실행됨 —', new Date().toISOString(), '| 2주 모니터링 대상')
import { config } from 'dotenv'
config({ path: '.env.local' })

// dotenv 로드 후에 env 읽는 모듈 import (r2.ts는 import 시점에 env 읽으므로 직접 초기화)
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL })
const prisma = new PrismaClient({ adapter })

// ─── 배너 정의 ───────────────────────────────────────────────────────────────
const BANNERS = [
  {
    filePath: 'assets/hero_banner/히어로 배너_1.jpg',
    r2Key: `banners/hero-1-${Date.now()}.jpg`,
    title: '히어로 배너 1',
    description: '서비스 소개',
    linkUrl: '/about',
    priority: 1,
  },
  {
    filePath: 'assets/hero_banner/히어로 배너_2.jpg',
    r2Key: `banners/hero-2-${Date.now() + 1}.jpg`,
    title: '히어로 배너 2',
    description: '사는이야기',
    linkUrl: '/community/stories',
    priority: 2,
  },
] as const

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
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

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  히어로 배너 업로드 스크립트')
  console.log('═══════════════════════════════════════════════\n')

  // Step 0: R2 env 확인 + S3Client 초기화 (dotenv 로드 후)
  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY?.trim()
  const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY?.trim()
  const BUCKET = (process.env.CLOUDFLARE_R2_BUCKET ?? 'unaeo-uploads').trim()
  const PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim()

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
    console.error('❌ [Step 0] R2 env 미설정 — CLOUDFLARE_ACCOUNT_ID / ACCESS_KEY / SECRET_KEY 확인')
    process.exit(1)
  }
  if (!PUBLIC_URL) {
    console.error('❌ [Step 0] NEXT_PUBLIC_R2_PUBLIC_URL 미설정')
    process.exit(1)
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  })
  console.log('✅ [Step 0] R2 env 확인 + S3Client 초기화 완료')

  // Step 1: 중복 배너 체크
  const existingCount = await prisma.banner.count()
  if (existingCount > 0) {
    const existing = await prisma.banner.findMany({ select: { id: true, title: true, priority: true } })
    console.log(`\n⚠️  [Step 1] 기존 배너 ${existingCount}개 발견:`)
    existing.forEach(b => console.log(`   - [${b.priority}] ${b.title} (id: ${b.id})`))
    console.log('\n   기존 배너를 삭제하고 새로 등록하려면 Ctrl+C 후 어드민에서 삭제 후 재실행하세요.')
    console.log('   계속하면 기존 배너에 추가됩니다.\n')
  } else {
    console.log('✅ [Step 1] 기존 배너 없음 — 새로 등록')
  }

  const startDate = new Date()
  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + 1)

  const results: Array<{ title: string; imageUrl: string; id: string }> = []

  for (const banner of BANNERS) {
    console.log(`\n───────────────────────────────────────────────`)
    console.log(`  ${banner.title} 처리 중...`)
    console.log(`───────────────────────────────────────────────`)

    // Step 2: 파일 읽기
    const absPath = resolve(banner.filePath)
    let buffer: Buffer
    try {
      buffer = readFileSync(absPath)
      console.log(`✅ [Step 2] 파일 읽기: ${absPath}`)
      console.log(`           크기: ${(buffer.length / 1024).toFixed(0)}KB`)
    } catch (err) {
      console.error(`❌ [Step 2] 파일 읽기 실패: ${absPath}`)
      console.error(`           ${err}`)
      process.exit(1)
    }

    // Step 3: R2 업로드
    let imageUrl: string
    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: banner.r2Key,
        Body: buffer,
        ContentType: 'image/jpeg',
      }))
      imageUrl = `${PUBLIC_URL}/${banner.r2Key}`
      console.log(`✅ [Step 3] R2 업로드 완료`)
      console.log(`           URL: ${imageUrl}`)
    } catch (err) {
      console.error(`❌ [Step 3] R2 업로드 실패:`)
      console.error(`           ${err}`)
      process.exit(1)
    }

    // Step 4: URL 접근성 검증
    console.log(`🔍 [Step 4] URL 접근성 확인 중...`)
    const accessible = checkUrlAccessible(imageUrl)
    if (accessible) {
      console.log(`✅ [Step 4] URL 접근 가능 (HTTP 200)`)
    } else {
      console.warn(`⚠️  [Step 4] URL 접근 불가 — R2 bucket이 public으로 설정됐는지 확인 필요`)
      console.warn(`           URL: ${imageUrl}`)
      console.warn(`           히어로 슬라이더는 next/image를 통해 표시되므로 계속 진행합니다.`)
    }

    // Step 5: DB 저장
    try {
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
      console.log(`✅ [Step 5] DB 저장 완료`)
      console.log(`           id: ${created.id}`)
      results.push({ title: banner.title, imageUrl, id: created.id })
    } catch (err) {
      console.error(`❌ [Step 5] DB 저장 실패:`)
      console.error(`           ${err}`)
      process.exit(1)
    }
  }

  // 최종 결과
  console.log('\n═══════════════════════════════════════════════')
  console.log('  ✅ 모든 배너 등록 완료')
  console.log('═══════════════════════════════════════════════')
  results.forEach(r => {
    console.log(`  • ${r.title}`)
    console.log(`    id: ${r.id}`)
    console.log(`    url: ${r.imageUrl}`)
  })
  console.log('\n다음 단계:')
  console.log('  1. npx tsc --noEmit — 타입 체크')
  console.log('  2. 홈페이지 접속 → 히어로 슬라이더에 배너 표시 확인')
  console.log('  3. 어드민 /admin/banners → 등록된 배너 목록 확인')
}

main()
  .catch(e => {
    console.error('\n❌ 예상치 못한 오류:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
