/**
 * 기존 스크래핑 게시글 HTML 재정제 + 카테고리 재분류
 *
 * 문제:
 * 1. 원본 사이트 HTML 잔재 (highslide, link.php, /attach/imageView, 무의미 class, 전체 <b>)
 * 2. 빈 태그 미정리 (<p><br></p>, <p><b> </b></p>)
 * 3. 카테고리 오분류 (boardType 미고려, HUMOR 키워드 부재, 유령 카테고리 "감동")
 * 4. 이미지 width/height 속성 그대로 (CSS 제어 방해)
 *
 * 실행: npx tsx scripts/fix-scraped-content.ts
 * 드라이런: npx tsx scripts/fix-scraped-content.ts --dry-run
 */

import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

// .env 로드
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

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const { prisma: prismaRaw, disconnect } = await import('../agents/core/db.js')
  const prisma = prismaRaw as ReturnType<typeof prismaRaw>
  const { classifyCategory } = await import('../agents/community/content-transformer.js')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[fix-scraped-content] ${DRY_RUN ? '🔍 DRY RUN' : '🔧 실행'} 시작`)
  console.log('='.repeat(60))

  // 1. BOT 스크래핑 게시글 전체 조회
  const posts = await prisma.post.findMany({
    where: {
      source: 'BOT',
      sourceSite: { not: null },
      status: { not: 'DELETED' },
    },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      boardType: true,
      sourceSite: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`[fix] BOT 스크래핑 게시글 총 ${posts.length}건`)

  let htmlFixed = 0
  let categoryFixed = 0
  let unchanged = 0

  for (const post of posts) {
    let newContent = post.content
    let newCategory = post.category
    let changed = false

    // ── HTML 정제 ──

    // 1. 펨코 rel="highslide" a wrapper 제거
    newContent = newContent.replace(/<a[^>]*rel=["']highslide["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

    // 2. 네이트판 /attach/imageView 링크 제거
    newContent = newContent.replace(/<a[^>]*href=["']\/attach\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

    // 3. 펨코 link.php 리다이렉터 → 실제 URL
    newContent = newContent.replace(
      /<a[^>]*href=["']https?:\/\/link\.fmkorea\.org\/link\.php\?url=([^"'&]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, encoded, inner) => `<a href="${decodeURIComponent(encoded)}" target="_blank" rel="noopener noreferrer">${inner}</a>`,
    )

    // 4. 무의미한 CSS class 제거 (source-attribution, image-placeholder만 보존)
    newContent = newContent.replace(/ class="(?!source-attribution|image-placeholder)[^"]*"/gi, '')

    // 5. 빈 태그 정리
    newContent = newContent.replace(/<p>\s*(?:<br\s*\/?>)\s*<\/p>/gi, '')
    newContent = newContent.replace(/<p>\s*<b>\s*<\/b>\s*<\/p>/gi, '')
    newContent = newContent.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    newContent = newContent.replace(/<div>\s*<\/div>/gi, '')

    // 6. 전체 <b> wrapping 제거 (오유 패턴)
    if (post.sourceSite === 'todayhumor') {
      newContent = newContent.replace(/<b>([\s\S]*?)<\/b>/gi, '$1')
    }

    // 7. 이미지 width/height 속성 제거 (CSS로 제어)
    newContent = newContent.replace(/(<img[^>]*?) width="[^"]*"/gi, '$1')
    newContent = newContent.replace(/(<img[^>]*?) height="[^"]*"/gi, '$1')

    // 8. 빈 <a> wrapper 정리
    newContent = newContent.replace(/<a[^>]*>\s*<\/a>/gi, '')

    // 9. 비디오 wrapper 내 중복 img 제거 (펨코)
    newContent = newContent.replace(
      /(<video[^>]*>[\s\S]*?<\/video>)\s*<img[^>]*\/?>/gi,
      '$1',
    )

    if (newContent !== post.content) changed = true

    // ── 카테고리 재분류 ──

    const boardType = post.boardType as 'STORY' | 'HUMOR'
    const validStory = ['일상', '건강', '고민', '자녀', '기타']
    const validHumor = ['유머', '힐링', '자랑', '추천', '기타']
    const validCategories = boardType === 'HUMOR' ? validHumor : validStory

    // 현재 카테고리가 해당 게시판에 유효하지 않으면 재분류
    if (!validCategories.includes(post.category || '')) {
      newCategory = classifyCategory(post.title, newContent, boardType)
      changed = true
    }

    if (changed) {
      const updates: Record<string, string> = {}
      if (newContent !== post.content) {
        updates.content = newContent
        htmlFixed++
      }
      if (newCategory !== post.category) {
        updates.category = newCategory
        categoryFixed++
      }

      if (!DRY_RUN) {
        await prisma.post.update({
          where: { id: post.id },
          data: updates,
        })
      }

      const changes: string[] = []
      if (newContent !== post.content) changes.push('HTML')
      if (newCategory !== post.category) changes.push(`카테고리: ${post.category}→${newCategory}`)
      console.log(`[fix] ${post.id}: ${post.title?.slice(0, 30)}... → ${changes.join(', ')}`)
    } else {
      unchanged++
    }
  }

  // BotLog 기록
  if (!DRY_RUN && (htmlFixed > 0 || categoryFixed > 0)) {
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        action: 'FIX_SCRAPED_CONTENT',
        status: 'SUCCESS',
        details: `HTML ${htmlFixed}건, 카테고리 ${categoryFixed}건 수정 (총 ${posts.length}건, 변경없음 ${unchanged}건)`,
        logData: { htmlFixed, categoryFixed, unchanged, total: posts.length },
      },
    })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[fix] 완료: HTML ${htmlFixed}건, 카테고리 ${categoryFixed}건 수정 (변경없음 ${unchanged}건)`)
  console.log('='.repeat(60))

  await disconnect()
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[fix] 치명적 오류:', err)
  process.exit(1)
})
