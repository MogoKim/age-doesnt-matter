/**
 * 네이버 쿠키 추출 스크립트 (1회성)
 * Chrome 프로필에서 네이버 로그인 쿠키를 추출해서 storage-state.json으로 저장
 *
 * 사용법: Chrome 완전히 종료 후 실행
 *   cd agents && npx tsx run-local.ts cafe/export-cookies.ts
 *
 * 이후 크롤러는 이 파일만 사용하므로 Chrome을 닫을 필요 없음
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CHROME_USER_DATA_DIR, CHROME_PROFILE } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')

async function main() {
  console.log('[ExportCookies] Chrome 프로필에서 네이버 쿠키 추출 시작')
  console.log(`[ExportCookies] 프로필: ${CHROME_USER_DATA_DIR}/${CHROME_PROFILE}`)

  // Chrome 프로필로 브라우저 열기 (1회성)
  const context = await chromium.launchPersistentContext(
    `${CHROME_USER_DATA_DIR}/${CHROME_PROFILE}`,
    {
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
      viewport: { width: 1280, height: 900 },
      timeout: 15000,
    },
  )

  const page = await context.newPage()

  // 네이버 접속해서 로그인 상태 확인
  await page.goto('https://naver.com', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 3000))

  // 로그인 확인
  const loginCheck = await page.locator('.MyView-module__nick_text___aAOnp, .nick_area .nick, [class*="nick"]').first().textContent().catch(() => null)
  if (loginCheck) {
    console.log(`[ExportCookies] 네이버 로그인 확인: ${loginCheck}`)
  } else {
    console.warn('[ExportCookies] 네이버 로그인 안 됨 — 쿠키가 유효하지 않을 수 있음')
  }

  // storage state 저장 (쿠키 + localStorage)
  const state = await context.storageState()
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify(state, null, 2))

  const cookieCount = state.cookies.length
  const naverCookies = state.cookies.filter(c => c.domain.includes('naver'))
  console.log(`[ExportCookies] 저장 완료: ${STORAGE_STATE_PATH}`)
  console.log(`[ExportCookies] 총 쿠키 ${cookieCount}개 (네이버 ${naverCookies.length}개)`)

  await page.close()
  await context.close()

  console.log('[ExportCookies] 완료! 이제 Chrome을 자유롭게 사용하세요.')
  console.log('[ExportCookies] 크롤러는 이 쿠키 파일로 독립 실행됩니다.')
}

main().catch(err => {
  console.error('[ExportCookies] 오류:', err)
  process.exit(1)
})
