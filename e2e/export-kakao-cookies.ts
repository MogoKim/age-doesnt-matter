/**
 * 우나어 서비스 로그인 쿠키 추출 → e2e/.auth/user.json 저장
 *
 * 사용법 (Chrome 완전히 종료 후 실행):
 *   npx tsx e2e/export-kakao-cookies.ts
 *
 * 전제조건:
 *   - Chrome Profile 1에 age-doesnt-matter.com 카카오 로그인 상태
 *   - Chrome 완전 종료 (Activity Monitor에서도 확인)
 *
 * Chrome 127+ App-Bound Encryption으로 인해 browser_cookie3 사용 불가.
 * Playwright로 Chrome 프로필 직접 로드해서 storageState 추출.
 *
 * 생성 파일: e2e/.auth/user.json (세션 유효기간 약 30일)
 * 주의: .gitignore에 e2e/.auth/ 포함 — 커밋하지 말 것
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CHROME_USER_DATA_DIR, CHROME_PROFILE } from '../agents/cafe/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AUTH_PATH = resolve(__dirname, '.auth/user.json')
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.age-doesnt-matter.com'

async function main() {
  console.log('[ExportKakaoCookies] Playwright로 Chrome 프로필 로드 시작')
  console.log(`[ExportKakaoCookies] 프로필: ${CHROME_USER_DATA_DIR}/${CHROME_PROFILE}`)
  console.log('[ExportKakaoCookies] ⚠️  Chrome이 완전히 종료된 상태여야 합니다')

  const browser = await chromium.launchPersistentContext(
    resolve(CHROME_USER_DATA_DIR, CHROME_PROFILE),
    {
      headless: false,             // 프로필 로드는 headless 불가
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
    },
  )

  const page = browser.pages()[0] ?? await browser.newPage()

  try {
    console.log(`[ExportKakaoCookies] ${BASE_URL} 접속 중...`)
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // 로그인 상태 확인 — NextAuth 세션 쿠키 존재 여부
    const cookies = await browser.cookies()
    const sessionCookie = cookies.find(
      (c) => c.name === 'next-auth.session-token' || c.name === '__Secure-next-auth.session-token',
    )

    if (!sessionCookie) {
      console.error('[ExportKakaoCookies] ❌ 세션 쿠키 없음 — 로그인 페이지로 이동합니다.')
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      console.log('[ExportKakaoCookies] 브라우저에서 카카오 로그인을 완료하세요. 최대 3분 대기...')

      // 세션 쿠키가 생길 때까지 5초마다 폴링 (최대 3분)
      let found = false
      for (let i = 0; i < 36; i++) {
        await page.waitForTimeout(5000)
        const current = await browser.cookies()
        const session = current.find(
          (c) => c.name === 'next-auth.session-token' || c.name === '__Secure-next-auth.session-token',
        )
        if (session) {
          console.log('[ExportKakaoCookies] ✅ 로그인 감지!')
          found = true
          break
        }
        const elapsed = (i + 1) * 5
        if (elapsed % 30 === 0) console.log(`[ExportKakaoCookies] 대기 중... ${elapsed}초 경과`)
      }

      if (!found) {
        console.error('[ExportKakaoCookies] ❌ 3분 내 로그인 미완료. 재시도하세요.')
        await browser.close()
        process.exit(1)
      }
    }

    // storageState 저장 (Playwright 형식으로 쿠키 + localStorage 포함)
    const storageState = await browser.storageState()

    // 세션 쿠키 확인 출력
    const sessionCookies = storageState.cookies.filter(
      (c) => c.name.includes('session-token') || c.name.includes('next-auth'),
    )
    console.log(`[ExportKakaoCookies] ✅ 총 쿠키: ${storageState.cookies.length}개`)
    console.log(`[ExportKakaoCookies] 세션 관련 쿠키: ${sessionCookies.map((c) => c.name).join(', ')}`)

    const domainMap = storageState.cookies.reduce<Record<string, number>>((acc, c) => {
      acc[c.domain] = (acc[c.domain] ?? 0) + 1
      return acc
    }, {})
    Object.entries(domainMap).forEach(([domain, count]) => {
      console.log(`  ${domain}: ${count}개`)
    })

    writeFileSync(AUTH_PATH, JSON.stringify(storageState, null, 2))
    console.log(`[ExportKakaoCookies] ✅ 저장 완료: ${AUTH_PATH}`)
    console.log('[ExportKakaoCookies] 이 파일로 qa-user 테스트가 인증된 상태로 실행됩니다.')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[ExportKakaoCookies] 오류:', err)
  process.exit(1)
})
