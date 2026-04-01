/**
 * 깨진 외부 스크래핑 게시글 수정 스크립트
 *
 * 문제: image-pipeline의 protocol-relative URL 버그로 인해
 *       이미지가 R2에 업로드되지 않고, <img> 태그가 제거되어 빈 <a> wrapper만 남음
 *
 * 해결:
 * 1. sourceUrl로 원본 페이지 재스크래핑
 * 2. 수정된 미디어 파이프라인으로 이미지/동영상 재처리
 * 3. content + thumbnailUrl DB 업데이트
 * 4. 재스크래핑 불가 시 깨진 HTML만 정리
 *
 * 실행: npx tsx scripts/fix-broken-scraped-posts.ts
 * 드라이런: npx tsx scripts/fix-broken-scraped-posts.ts --dry-run
 */

import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

// .env 로드 (launchd/직접 실행 대응)
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

// prisma는 main()에서 동적 import (top-level await가 CJS에서 불가)
const DRY_RUN = process.argv.includes('--dry-run')

// ESM 동적 import (agents/ 모듈)
async function loadAgentModules() {
  const { processContentMedia } = await import('../agents/community/image-pipeline.js')
  const { transformContent, classifyCategory } = await import('../agents/community/content-transformer.js')
  const { detectSite, randomUserAgent, isCloudflareChallenge } = await import('../agents/community/site-configs.js')
  return { processContentMedia, transformContent, classifyCategory, detectSite, randomUserAgent, isCloudflareChallenge }
}

async function main() {
  // 동적 import (CJS top-level await 불가)
  const { prisma: prismaRaw, disconnect } = await import('../agents/core/db.js')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = prismaRaw as any

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[fix-broken-scraped-posts] ${DRY_RUN ? '🔍 DRY RUN' : '🔧 실행'} 시작`)
  console.log('='.repeat(60))

  // 1. 깨진 게시글 조회
  const brokenPosts = await prisma.post.findMany({
    where: {
      source: 'BOT',
      sourceSite: { not: null },
      sourceUrl: { not: null },
    },
    select: {
      id: true,
      title: true,
      content: true,
      sourceUrl: true,
      sourceSite: true,
      thumbnailUrl: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`[fix] BOT 스크래핑 게시글 총 ${brokenPosts.length}건`)

  // 깨진 게시글 필터: 빈 <a> 태그, protocol-relative URL, 외부 이미지 URL 포함
  const needsFix = brokenPosts.filter((p) => {
    const content = p.content
    // 빈 <a> wrapper
    if (/<a[^>]*>\s*<\/a>/i.test(content)) return true
    // protocol-relative 이미지 URL이 그대로 남아있는 경우
    if (/src=["']\/\/[^"']+["']/i.test(content)) return true
    // 외부 도메인 이미지가 R2로 변환되지 않은 경우
    if (/src=["'](?:\/\/|https?:\/\/)(?:image\.fmkorea|getfile\.fmkorea|todayhumor|pann\.nate)/i.test(content)) return true
    return false
  })

  console.log(`[fix] 수정 필요: ${needsFix.length}건`)

  if (needsFix.length === 0) {
    console.log('[fix] 수정 필요한 게시글 없음')
    await disconnect()
    return
  }

  // 2. 에이전트 모듈 로드
  const modules = await loadAgentModules()

  // 3. 브라우저 시작
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: modules.randomUserAgent(),
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  })

  let fixed = 0
  let cleaned = 0
  let failed = 0

  for (const post of needsFix) {
    console.log(`\n[fix] ${post.id}: ${post.title}`)
    console.log(`  소스: ${post.sourceUrl}`)

    const siteConfig = modules.detectSite(post.sourceUrl!)
    if (!siteConfig) {
      console.log('  → SKIP: 사이트 설정 없음')
      failed++
      continue
    }

    try {
      // 재스크래핑 시도
      const page = await context.newPage()
      try {
        await page.goto(post.sourceUrl!, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        })

        await new Promise((r) => setTimeout(r, siteConfig.minDelay))

        const bodyHtml = await page.content()
        if (siteConfig.cloudflareProtected && modules.isCloudflareChallenge(bodyHtml)) {
          throw new Error('CF_BLOCKED')
        }

        // 본문 추출
        const rawContent = await extractHtml(page, siteConfig.selectors.content)
        if (!rawContent) throw new Error('본문 추출 실패')

        // 콘텐츠 변환
        const transformed = modules.transformContent(rawContent, post.sourceUrl!, siteConfig)

        // 미디어 파이프라인 (수정된 버전)
        const dateKey = new Date().toISOString().slice(0, 10)
        const postKey = `${dateKey}/fix-${post.id}`
        const { html: finalContent, thumbnailUrl, imageCount, videoCount } = await modules.processContentMedia(
          transformed,
          post.sourceUrl!,
          postKey,
        )

        if (DRY_RUN) {
          console.log(`  → DRY RUN: 이미지 ${imageCount}개, 동영상 ${videoCount}개 처리 예정`)
        } else {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              content: finalContent,
              thumbnailUrl: thumbnailUrl || post.thumbnailUrl,
            },
          })
          console.log(`  → FIXED: 이미지 ${imageCount}개, 동영상 ${videoCount}개`)
        }
        fixed++
      } finally {
        await page.close()
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.log(`  → 재스크래핑 실패 (${errorMsg}), HTML 정리만 수행`)

      // 재스크래핑 실패 시: 깨진 HTML만 정리
      let cleanedContent = post.content
      // 빈 <a> wrapper 제거
      cleanedContent = cleanedContent.replace(/<a[^>]*>\s*<\/a>/gi, '')
      // 출처 div 인라인 스타일 → class 변경
      cleanedContent = cleanedContent.replace(
        /<div\s+style="[^"]*">\s*(📎\s*출처:[\s\S]*?)<\/div>/gi,
        '<div class="source-attribution">$1</div>',
      )
      // 빈 <p> 정리
      cleanedContent = cleanedContent.replace(/<p>\s*<\/p>/g, '')

      if (cleanedContent !== post.content) {
        if (!DRY_RUN) {
          await prisma.post.update({
            where: { id: post.id },
            data: { content: cleanedContent },
          })
        }
        console.log(`  → CLEANED: HTML 정리 완료`)
        cleaned++
      } else {
        console.log(`  → SKIP: 변경 없음`)
        failed++
      }
    }

    // 딜레이
    await new Promise((r) => setTimeout(r, 2000))
  }

  await context.browser()?.close()

  // 4. BotLog 기록
  if (!DRY_RUN) {
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        action: 'FIX_BROKEN_POSTS',
        status: failed === 0 ? 'SUCCESS' : fixed > 0 ? 'PARTIAL' : 'FAILED',
        details: `수정 ${fixed}건, 정리 ${cleaned}건, 실패 ${failed}건 (총 ${needsFix.length}건)`,
        logData: { fixed, cleaned, failed, total: needsFix.length },
      },
    })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[fix] 완료: 재스크래핑 ${fixed}건, HTML정리 ${cleaned}건, 실패 ${failed}건`)
  console.log('='.repeat(60))

  await disconnect()
}

async function extractHtml(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        const html = await el.innerHTML()
        if (html?.trim()) return html.trim()
      }
    } catch {
      continue
    }
  }
  return null
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[fix] 치명적 오류:', err)
  process.exit(1)
})
