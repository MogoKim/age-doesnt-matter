/**
 * 네이버 카페 게시판 자동 발견 스크립트 (1회 실행)
 *
 * 각 카페에 접속하여 사이드바 메뉴에서 전체 게시판 목록과 menuId를 추출합니다.
 * 결과를 JSON으로 출력하며, 이를 config.ts에 반영합니다.
 *
 * 사용법: npx tsx agents/cafe/discover-boards.ts
 * 주의: storage-state.json (쿠키)이 필요합니다 → export-cookies.ts 먼저 실행
 */

import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CAFE_CONFIGS } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface DiscoveredBoard {
  name: string
  menuId: number
  articleCount?: number
}

async function discoverBoards() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error('[DiscoverBoards] storage-state.json 없음 — export-cookies.ts 먼저 실행하세요')
    process.exit(1)
  }

  const storageState = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8'))

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ storageState })
  const page = await context.newPage()

  const results: Record<string, DiscoveredBoard[]> = {}

  for (const cafe of CAFE_CONFIGS) {
    console.log(`\n[DiscoverBoards] === ${cafe.name} (${cafe.id}) ===`)
    const boards: DiscoveredBoard[] = []

    try {
      // 카페 메인 페이지 방문
      await page.goto(cafe.url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await sleep(3000)

      // 방법 1: f-e 형식 사이드바 메뉴 (신 형식)
      // 사이드바 메뉴 링크에서 menuId 추출
      const menuLinks = await page.locator('a[href*="/menus/"]').all()

      for (const link of menuLinks) {
        try {
          const href = await link.getAttribute('href')
          const text = (await link.textContent())?.trim()
          if (!href || !text) continue

          const menuMatch = href.match(/\/menus\/(\d+)/)
          if (!menuMatch) continue

          const menuId = parseInt(menuMatch[1], 10)
          if (isNaN(menuId)) continue

          // 중복 제거
          if (boards.some(b => b.menuId === menuId)) continue

          boards.push({ name: text, menuId })
        } catch {
          // 개별 링크 실패 무시
        }
      }

      // 방법 2: cafe_main iframe 내 사이드바 (구 형식 폴백)
      if (boards.length < 3) {
        const cafeFrame = page.frame('cafe_main')
        if (cafeFrame) {
          const iframeLinks = await cafeFrame.locator('a[href*="menuid="]').all()
          for (const link of iframeLinks) {
            try {
              const href = await link.getAttribute('href')
              const text = (await link.textContent())?.trim()
              if (!href || !text) continue

              const menuMatch = href.match(/menuid=(\d+)/)
              if (!menuMatch) continue

              const menuId = parseInt(menuMatch[1], 10)
              if (isNaN(menuId) || boards.some(b => b.menuId === menuId)) continue

              boards.push({ name: text, menuId })
            } catch {
              // 개별 링크 실패 무시
            }
          }
        }
      }

      // 방법 3: 전체 페이지에서 menuId 포함 링크 폭넓게 수집
      if (boards.length < 3) {
        const allLinks = await page.locator('a').all()
        for (const link of allLinks) {
          try {
            const href = await link.getAttribute('href')
            const text = (await link.textContent())?.trim()
            if (!href || !text || text.length > 30 || text.length < 2) continue

            // f-e 형식: /cafes/{numericId}/menus/{menuId}
            const feMatch = href.match(new RegExp(`/cafes/${cafe.numericId}/menus/(\\d+)`))
            if (feMatch) {
              const menuId = parseInt(feMatch[1], 10)
              if (!isNaN(menuId) && !boards.some(b => b.menuId === menuId)) {
                boards.push({ name: text, menuId })
              }
            }

            // 구 형식: MenuList.nhn?...menuid=XX
            const oldMatch = href.match(/menuid=(\d+)/)
            if (oldMatch) {
              const menuId = parseInt(oldMatch[1], 10)
              if (!isNaN(menuId) && !boards.some(b => b.menuId === menuId)) {
                boards.push({ name: text, menuId })
              }
            }
          } catch {
            // 무시
          }
        }
      }

      // 정렬: menuId 순
      boards.sort((a, b) => a.menuId - b.menuId)

      console.log(`[DiscoverBoards] ${cafe.name}: ${boards.length}개 게시판 발견`)
      for (const b of boards) {
        console.log(`  menuId=${b.menuId}\t${b.name}`)
      }
    } catch (err) {
      console.error(`[DiscoverBoards] ${cafe.name} 실패:`, err)
    }

    results[cafe.id] = boards
  }

  await page.close()
  await context.close()
  await browser.close()

  // JSON 결과 출력
  console.log('\n\n========== 전체 결과 (JSON) ==========')
  console.log(JSON.stringify(results, null, 2))

  // config.ts에 넣을 형식으로 출력
  console.log('\n\n========== config.ts용 제안 ==========')
  for (const [cafeId, boards] of Object.entries(results)) {
    console.log(`\n// ${cafeId}`)
    for (const b of boards) {
      const suggestion = suggestPriority(b.name)
      console.log(`  { name: '${b.name}', menuId: ${b.menuId}, maxPages: ${suggestion.maxPages}, priority: '${suggestion.priority}', category: '${suggestion.category}' },`)
    }
  }
}

/** 게시판 이름으로 우선순위 자동 추천 */
function suggestPriority(name: string): { priority: string; category: string; maxPages: number } {
  const n = name.toLowerCase()

  // SKIP: 가치 없는 게시판
  const skipPatterns = ['가입', '공지', '출석', '인사', '양식', '이벤트당첨', '운영', '광고', '홍보', '규칙', '안내', '공구', '판매']
  if (skipPatterns.some(p => n.includes(p))) {
    return { priority: 'skip', category: 'general', maxPages: 0 }
  }

  // HIGH: 50-60대 타겟에 직접 유용
  if (n.includes('건강') || n.includes('의료') || n.includes('운동') || n.includes('약')) {
    return { priority: 'high', category: 'health', maxPages: 3 }
  }
  if (n.includes('요리') || n.includes('맛집') || n.includes('음식') || n.includes('레시피') || n.includes('반찬')) {
    return { priority: 'high', category: 'food', maxPages: 3 }
  }
  if (n.includes('취미') || n.includes('여가') || n.includes('등산') || n.includes('텃밭') || n.includes('낚시') || n.includes('음악') || n.includes('사진')) {
    return { priority: 'high', category: 'hobby', maxPages: 3 }
  }
  if (n.includes('유머') || n.includes('웃음') || n.includes('힐링') || n.includes('재미') || n.includes('웃긴')) {
    return { priority: 'high', category: 'humor', maxPages: 3 }
  }
  if (n.includes('일자리') || n.includes('취업') || n.includes('채용') || n.includes('구직') || n.includes('알바')) {
    return { priority: 'high', category: 'job', maxPages: 3 }
  }
  if (n.includes('재테크') || n.includes('연금') || n.includes('보험') || n.includes('부동산') || n.includes('금융')) {
    return { priority: 'high', category: 'finance', maxPages: 3 }
  }
  if (n.includes('생활') || n.includes('정보') || n.includes('팁') || n.includes('꿀팁') || n.includes('노하우')) {
    return { priority: 'high', category: 'lifestyle', maxPages: 3 }
  }
  if (n.includes('인기') || n.includes('베스트') || n.includes('추천')) {
    return { priority: 'high', category: 'general', maxPages: 3 }
  }

  // MEDIUM: 참여도 높지만 품질 편차
  if (n.includes('자유') || n.includes('수다') || n.includes('일상') || n.includes('이야기') || n.includes('잡담')) {
    return { priority: 'medium', category: 'lifestyle', maxPages: 1 }
  }
  if (n.includes('여행') || n.includes('나들이') || n.includes('산책')) {
    return { priority: 'medium', category: 'hobby', maxPages: 2 }
  }

  // 기본: medium
  return { priority: 'medium', category: 'general', maxPages: 1 }
}

discoverBoards().catch((err) => {
  console.error('[DiscoverBoards] 치명적 오류:', err)
  process.exit(1)
})
