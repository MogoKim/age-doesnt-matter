// LOCAL ONLY — 네이버 카페 menuId 추출 스크립트
/**
 * Playwright + 저장된 쿠키로 각 카페 메인 페이지를 방문하여
 * 게시판 이름 → menuId 매핑을 추출합니다.
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, '../agents/cafe/storage-state.json')

const CAFES = [
  { id: 'dlxogns01', url: 'https://cafe.naver.com/dlxogns01', numericId: 0 },
  { id: 'wgang',     url: 'https://cafe.naver.com/wgang',     numericId: 10050146 },
  { id: 'welovesilver', url: 'https://cafe.naver.com/welovesilver', numericId: 26816499 },
  { id: '5060years', url: 'https://cafe.naver.com/5060years', numericId: 29062022 },
]

const TARGET_BOARDS: Record<string, string[]> = {
  dlxogns01: [
    '자유로운 이야기', '예비은퇴자', '은퇴 일기', '건강', '고민',
    '투자', '일자리', '자격증', '귀농', '귀촌', '일상', '행복',
  ],
  wgang: ['마음 증상', '딸', '아들', '남편'],
  welovesilver: ['가족', '자녀', '부모', '손주', '손녀'],
  '5060years': ['자격증', '노후', '화가'],
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error('❌ storage-state.json 없음 — export-cookies.ts 먼저 실행')
    process.exit(1)
  }

  const stateData = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8'))
  for (const c of stateData.cookies ?? []) {
    if (typeof c.secure !== 'boolean') c.secure = Boolean(c.secure)
    if (typeof c.httpOnly !== 'boolean') c.httpOnly = Boolean(c.httpOnly)
  }

  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    storageState: stateData,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  const result: Record<string, { numericId: number; boards: Record<string, number> }> = {}

  for (const cafe of CAFES) {
    console.log(`\n=== ${cafe.id} ===`)
    const boards: Record<string, number> = {}
    let numericId = cafe.numericId

    try {
      await page.goto(cafe.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await sleep(3000)

      // numericId 추출 (URL에서)
      if (numericId === 0) {
        const currentUrl = page.url()
        const numericMatch = currentUrl.match(/\/cafes\/(\d+)/)
        if (numericMatch) {
          numericId = parseInt(numericMatch[1])
          console.log(`  numericId = ${numericId} (URL에서 추출)`)
        }
        // href 링크에서도 시도
        if (numericId === 0) {
          const hrefs = await page.locator('a[href*="/cafes/"]').all()
          for (const a of hrefs.slice(0, 20)) {
            const href = await a.getAttribute('href').catch(() => null)
            const m = href?.match(/\/cafes\/(\d+)/)
            if (m) { numericId = parseInt(m[1]); break }
          }
          if (numericId !== 0) console.log(`  numericId = ${numericId} (링크에서 추출)`)
        }
      }

      // 게시판 링크 수집 — menuid= 또는 /menus/ 패턴
      const allLinks = await page.locator('a[href*="menuid"], a[href*="/menus/"]').all()
      for (const link of allLinks) {
        const href = await link.getAttribute('href').catch(() => null)
        const text = (await link.textContent().catch(() => '')).trim()
        if (!href || !text) continue

        // menuid 추출
        let menuId = 0
        const menuMatch = href.match(/menuid=(\d+)/) ?? href.match(/\/menus\/(\d+)/)
        if (menuMatch) menuId = parseInt(menuMatch[1])
        if (!menuId) continue

        // 타겟 게시판 이름 매칭
        const targets = TARGET_BOARDS[cafe.id] ?? []
        const matched = targets.find(t => text.includes(t))
        if (matched) {
          boards[text] = menuId
          console.log(`  "${text}" → menuId=${menuId}`)
        }
      }

      // 사이드바 네비게이션에서도 추출 (f-e 신형식)
      if (Object.keys(boards).length === 0) {
        // 신형식: cafe 메뉴 항목들
        const navItems = await page.locator('.cafe-menu-list a, .MenuList a, .gnb_menu a, nav a').all()
        for (const item of navItems) {
          const href = await item.getAttribute('href').catch(() => null)
          const text = (await item.textContent().catch(() => '')).trim()
          if (!href || !text) continue
          const menuMatch = href.match(/menuid=(\d+)/) ?? href.match(/\/menus\/(\d+)/)
          if (!menuMatch) continue
          const menuId = parseInt(menuMatch[1])
          const targets = TARGET_BOARDS[cafe.id] ?? []
          const matched = targets.find(t => text.includes(t))
          if (matched) {
            boards[text] = menuId
            console.log(`  [nav] "${text}" → menuId=${menuId}`)
          }
        }
      }

    } catch (err) {
      console.error(`  ❌ ${cafe.id} 접근 실패:`, err instanceof Error ? err.message : err)
    }

    result[cafe.id] = { numericId, boards }
    await sleep(2000)
  }

  await context.close()
  await browser.close()

  console.log('\n\n========== 최종 결과 ==========')
  console.log(JSON.stringify(result, null, 2))
  console.log('================================')
  console.log('\n위 결과를 Claude에게 붙여넣으면 config.ts를 자동으로 업데이트합니다.')
}

main().catch(err => {
  console.error('치명적 오류:', err)
  process.exit(1)
})
