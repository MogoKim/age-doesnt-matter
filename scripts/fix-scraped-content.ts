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
    const boardType = post.boardType as 'STORY' | 'HUMOR'

    // 1. 출처 표시 수정 (class 제거 전에 먼저 처리!)
    if (boardType === 'STORY') {
      // 사는이야기: 출처 완전 제거 (개인 글처럼 보여야 함)
      newContent = newContent.replace(/<div[^>]*class="[^"]*source-attribution[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      // class가 이미 제거된 경우: 📎 출처 패턴으로 div 매칭
      newContent = newContent.replace(/<div[^>]*>\s*📎\s*출처:[\s\S]*?<\/div>/gi, '')
      // <p>출처:...</p> 형태
      newContent = newContent.replace(/<p>\s*📎?\s*출처:\s*[\s\S]*?<\/p>/gi, '')
    } else {
      // 활력충전소: 스타일된 div → 단순 텍스트 (이모지/링크 제거)
      // class 있는 경우
      newContent = newContent.replace(
        /<div[^>]*class="[^"]*source-attribution[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
        (match) => {
          const siteNameMatch = match.match(/>([^<]+)<\/a>/i)
          const siteName = siteNameMatch?.[1] || post.sourceSite || ''
          return siteName ? `<p>출처: ${siteName}</p>` : ''
        },
      )
      // class가 이미 제거된 경우: 📎 출처 패턴으로 div 매칭
      newContent = newContent.replace(
        /<div[^>]*>\s*📎\s*출처:[\s\S]*?<\/div>/gi,
        (match) => {
          const siteNameMatch = match.match(/>([^<]+)<\/a>/i)
          const siteName = siteNameMatch?.[1] || post.sourceSite || ''
          return siteName ? `<p>출처: ${siteName}</p>` : ''
        },
      )
      // <p>📎 출처: <a>사이트</a></p> 형태도 정리
      newContent = newContent.replace(
        /<p>\s*📎\s*출처:\s*<a[^>]*>([^<]+)<\/a>\s*<\/p>/gi,
        (_, siteName) => `<p>출처: ${siteName}</p>`,
      )
    }

    // 2. 펨코 rel="highslide" a wrapper 제거
    newContent = newContent.replace(/<a[^>]*rel=["']highslide["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

    // 3. 네이트판 /attach/imageView 링크 제거
    newContent = newContent.replace(/<a[^>]*href=["']\/attach\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

    // 4. 펨코 link.php 리다이렉터 → 실제 URL
    newContent = newContent.replace(
      /<a[^>]*href=["']https?:\/\/link\.fmkorea\.org\/link\.php\?url=([^"'&]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, encoded, inner) => `<a href="${decodeURIComponent(encoded)}" target="_blank" rel="noopener noreferrer">${inner}</a>`,
    )

    // 5. 무의미한 CSS class 제거 (image-placeholder, post-video만 보존)
    newContent = newContent.replace(/ class="(?!image-placeholder|post-video)[^"]*"/gi, '')

    // 6. 빈 태그 정리
    newContent = newContent.replace(/<p>\s*(?:<br\s*\/?>)\s*<\/p>/gi, '')
    newContent = newContent.replace(/<p>\s*<b>\s*<\/b>\s*<\/p>/gi, '')
    newContent = newContent.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    newContent = newContent.replace(/<div>\s*<\/div>/gi, '')

    // 7. 전체 <b> wrapping 제거 (오유 패턴)
    if (post.sourceSite === 'todayhumor') {
      newContent = newContent.replace(/<b>([\s\S]*?)<\/b>/gi, '$1')
    }

    // 8. 이미지 width/height 속성 제거 (CSS로 제어)
    newContent = newContent.replace(/(<img[^>]*?) width="[^"]*"/gi, '$1')
    newContent = newContent.replace(/(<img[^>]*?) height="[^"]*"/gi, '$1')

    // 9. 빈 <a> wrapper 정리
    newContent = newContent.replace(/<a[^>]*>\s*<\/a>/gi, '')

    // 10. 비디오 wrapper 내 중복 img 제거 (펨코)
    newContent = newContent.replace(
      /(<video[^>]*>[\s\S]*?<\/video>)\s*<img[^>]*\/?>/gi,
      '$1',
    )

    // 11. 비디오 플레이어 UI 잔해 제거 (펨코 MediaElement.js)
    // "Video Player" 텍스트
    newContent = newContent.replace(/Video Player/g, '')
    // 속도 셀렉터 리스트: <ul><li>2.00x</li><li>1.75x</li>...</ul>
    newContent = newContent.replace(/<ul>\s*(?:<li>\s*\d\.\d{2}x\s*<\/li>\s*)+<\/ul>/gi, '')
    // 속도 값 + 내부 div: <div>1.00x<div>...</div></div> → 내부 제거 후 빈 div
    newContent = newContent.replace(/<div>\s*\d\.\d{2}x\s*(?:<div>\s*<\/div>\s*)?<\/div>/gi, '')
    // 시간 구분자: <div> / </div>
    newContent = newContent.replace(/<div>\s*\/\s*<\/div>/gi, '')
    // 타임스탬프: <div>00:00</div>, <div>00:02</div>
    newContent = newContent.replace(/<div>\s*\d{1,2}:\d{2}\s*<\/div>/gi, '')
    // li/span/p 안의 속도/타임스탬프
    newContent = newContent.replace(/<li>\s*\d\.\d{2}x\s*<\/li>/gi, '')
    newContent = newContent.replace(/<span>\s*\d{1,2}:\d{2}\s*<\/span>/gi, '')
    newContent = newContent.replace(/<p>\s*\d\.\d{2}x\s*<\/p>/gi, '')

    // 12. STORY에서 남은 출처 텍스트도 제거 (plain text 형태)
    if (boardType === 'STORY') {
      newContent = newContent.replace(/<p>\s*출처:\s*[^<]*<\/p>/gi, '')
      newContent = newContent.replace(/📎\s*출처:[^\n<]*/g, '')
    }

    // 13. 연속 빈 줄/빈 div 정리 (최종)
    newContent = newContent.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    newContent = newContent.replace(/<div>\s*<\/div>/gi, '')
    newContent = newContent.replace(/\n{3,}/g, '\n\n')
    newContent = newContent.trim()

    if (newContent !== post.content) changed = true

    // ── 카테고리 재분류 ──

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
