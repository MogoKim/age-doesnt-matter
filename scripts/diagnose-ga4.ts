/**
 * GA4 & GTM 진단 스크립트 v2
 *
 * GA4 네트워크 요청(/g/collect)은 헤드리스 브라우저에서 봇 감지로 차단됨.
 * 대신 window.dataLayer / sessionStorage / window.gtag 존재 여부를 직접 확인.
 *
 * 실행: npx tsx scripts/diagnose-ga4.ts [URL]
 * 기본값: https://age-doesnt-matter.com
 */

console.log('[WATCH] diagnose-ga4.ts 실행됨 —', new Date().toISOString(), '| 2주 모니터링 대상')
import { chromium } from '@playwright/test'

const BASE_URL = process.argv.find((a) => a.startsWith('http')) ?? 'https://age-doesnt-matter.com'

interface DiagResult {
  label: string
  pass: boolean
  detail?: string
}

const results: DiagResult[] = []

function pass(label: string, detail?: string) {
  results.push({ label, pass: true, detail })
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label: string, detail?: string) {
  results.push({ label, pass: false, detail })
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
}

function warn(label: string, detail?: string) {
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ''}`)
}

async function run() {
  console.log(`\n🔍 GA4 & GTM 진단 시작 — ${BASE_URL}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  // ── 1. 홈 로드 + gtag / dataLayer 초기화 확인 ──
  console.log('── 1. gtag / dataLayer 초기화 확인 ──')
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  // afterInteractive 스크립트 실행 여유
  await page.waitForTimeout(4000)

  const gtagExists = await page.evaluate(() => typeof window.gtag === 'function')
  const dataLayerExists = await page.evaluate(() => Array.isArray(window.dataLayer))

  if (gtagExists) pass('window.gtag 함수 정의됨')
  else fail('window.gtag 미정의 — gtag-init 스크립트 실행 실패')

  if (dataLayerExists) {
    const dlLength = await page.evaluate(() => window.dataLayer?.length ?? 0)
    pass(`window.dataLayer 초기화됨`, `${dlLength}개 항목`)
  } else {
    fail('window.dataLayer 미초기화')
  }

  // ── 2. dataLayer 이벤트 목록 확인 ──
  console.log('\n── 2. dataLayer 이벤트 목록 ──')
  const dlEvents = await page.evaluate(() =>
    (window.dataLayer ?? [])
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => item['event'] as string)
      .filter(Boolean)
  )
  console.log(`  📋 dataLayer 이벤트: ${dlEvents.join(', ') || '(없음)'}`)

  const hasGtmStart = dlEvents.includes('gtm.js')
  if (hasGtmStart) pass('GTM 컨테이너 초기화 (gtm.js 이벤트)')
  else warn('GTM gtm.js 이벤트 없음 — GTM 미설치 또는 ID 오류 가능성')

  // ── 3. page_view 중복 발사 확인 (dataLayer 기반) ──
  console.log('\n── 3. page_view 중복 발사 확인 ──')
  const pageViewCount = dlEvents.filter((e) => e === 'page_view').length
  if (pageViewCount === 0) {
    warn('dataLayer에 page_view 없음 — GTM이 자동 pageview 미발사 (gtag() 직접 전송만 사용 중)')
  } else if (pageViewCount === 1) {
    pass(`dataLayer page_view 1회 — 중복 없음`)
  } else {
    fail(`dataLayer page_view ${pageViewCount}회 — BUG-02 중복 발사 확인됨`)
  }

  // ── 4. UTM 파라미터 캡처 확인 ──
  console.log('\n── 4. UTM 파라미터 캡처 확인 ──')
  await page.goto(`${BASE_URL}/?utm_source=google&utm_medium=cpc&utm_campaign=test`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const storedUtm = await page.evaluate(() => sessionStorage.getItem('unao_utm'))
  if (storedUtm) {
    const parsed = JSON.parse(storedUtm) as Record<string, string>
    if (parsed.utm_source === 'google') pass('UTM sessionStorage 저장', JSON.stringify(parsed))
    else fail('UTM 파싱 오류', storedUtm)
  } else {
    fail('UTM sessionStorage 미저장')
  }

  // ── 5. gclid 캡처 확인 ──
  console.log('\n── 5. gclid 캡처 확인 ──')
  // 새 세션으로 gclid 테스트 (기존 UTM 덮어쓰기 방지)
  const gPage = await context.newPage()
  await gPage.goto(`${BASE_URL}/?gclid=test_gclid_xyz`, { waitUntil: 'networkidle' })
  await gPage.waitForTimeout(2000)
  const storedGclid = await gPage.evaluate(() => sessionStorage.getItem('unao_utm'))
  if (storedGclid) {
    const parsed = JSON.parse(storedGclid) as Record<string, string>
    if (parsed.gclid === 'test_gclid_xyz') pass('gclid sessionStorage 저장', parsed.gclid)
    else fail('gclid 미저장 — captureUtm()에 gclid 미포함 (수정 후 배포 필요)', storedGclid)
  } else {
    fail('gclid sessionStorage 전체 미저장')
  }
  await gPage.close()

  // ── 6. login 이벤트 중복 확인 (새로고침 시) ──
  console.log('\n── 6. login 이벤트 중복 확인 ──')
  // 로그인 상태 확인
  const isLoggedIn = await page.evaluate(() => document.cookie.includes('next-auth.session-token') || document.cookie.includes('__Secure-next-auth.session-token'))
  if (!isLoggedIn) {
    warn('비로그인 상태 — login 이벤트 중복 테스트 스킵 (로그인 후 수동 확인 필요)')
    warn('수동 확인 방법: 로그인 후 새로고침 → GA4 DebugView에서 login 이벤트 1회만 뜨는지 확인')
  } else {
    const loginFlag = await page.evaluate(() => sessionStorage.getItem('unao_login_ev'))
    if (loginFlag === '1') pass('login sessionStorage 플래그 존재 — 중복 발사 방지 작동')
    else fail('login sessionStorage 플래그 없음 — 로그인 이벤트 중복 발사 가능')
  }

  // ── 7. job_view 이벤트 확인 ──
  console.log('\n── 7. job_view / magazine_view 이벤트 확인 ──')
  await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const firstJobHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/jobs/"]'))
    return links[0]?.getAttribute('href') ?? null
  })

  if (firstJobHref) {
    await page.goto(`${BASE_URL}${firstJobHref}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(4000)

    // GTMEventOnMount가 sendGtmEvent 큰 경우 dataLayer에는 안 보임 (gtag 직접 전송)
    // 대신 window.gtag가 호출됐는지 intercept로 확인
    const gtagCallLog = await page.evaluate(() => {
      const calls: string[] = []
      const orig = window.gtag
      if (!orig) return calls
      // 이미 호출된 것은 확인 불가 — gtag 존재 자체만 확인
      return typeof orig === 'function' ? ['gtag_exists'] : []
    })
    if (gtagCallLog.includes('gtag_exists')) {
      pass('job 페이지 gtag 사용 가능 상태 확인', firstJobHref)
      warn('job_view 실제 발사 여부는 GA4 DebugView에서 ?debug_mode=1 파라미터로 확인 필요')
    } else {
      fail('job 페이지 gtag 미정의', firstJobHref)
    }
  } else {
    warn('일자리 게시글 없어 job_view 테스트 스킵')
  }

  // ── 8. /api/events 내부 DB 요청 확인 ──
  console.log('\n── 8. /api/events 내부 이벤트 DB 확인 ──')
  const apiResult = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName: 'diag_test', path: '/diag' }),
      })
      return { status: res.status, ok: res.ok }
    } catch (e) {
      return { status: 0, ok: false, error: String(e) }
    }
  })
  if (apiResult.ok) pass(`/api/events POST 성공 (${apiResult.status})`)
  else fail(`/api/events POST 실패 (${apiResult.status})`)

  // ── 9. GTM Preview 대체 — dataLayer 구조 전체 출력 ──
  console.log('\n── 9. dataLayer 전체 내용 (GTM 태그 확인용) ──')
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const fullDL = await page.evaluate(() =>
    JSON.stringify(window.dataLayer ?? [], null, 2).slice(0, 2000)
  )
  console.log('  📋 dataLayer 내용:')
  fullDL.split('\n').forEach((line) => console.log(`    ${line}`))

  const hasGA4Config = fullDL.includes('config') && fullDL.includes('G-')
  if (hasGA4Config) {
    warn('dataLayer에 GA4 config 발견 — GTM 컨테이너 내 GA4 태그 가능성 (BUG-02 주의)')
  } else {
    pass('dataLayer에 GA4 config 없음 — GTM 자동 pageview 미발사 (BUG-02 없음)')
  }

  await browser.close()

  // ── 최종 요약 ──
  console.log('\n' + '─'.repeat(52))
  console.log('📊 진단 결과 요약')
  console.log('─'.repeat(52))
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`  통과: ${passed} / 전체: ${results.length}`)
  if (failed > 0) {
    console.log('\n  실패 항목:')
    results.filter((r) => !r.pass).forEach((r) => {
      console.log(`    ❌ ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
    })
  }
  console.log('─'.repeat(52))
  console.log('\n💡 BUG-02 page_view 중복 최종 확인:')
  console.log('   Chrome → age-doesnt-matter.com/?debug_mode=1')
  console.log('   GA4 콘솔 → Configure → DebugView → page_view 횟수 확인')

  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error('진단 스크립트 오류:', err)
  process.exit(1)
})
