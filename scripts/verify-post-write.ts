/**
 * 글쓰기 전면 개편 검수 스크립트
 * - 폰트 크기 CSS 변수 적용 여부
 * - 글쓰기 페이지 에디터 UI
 * - 매거진/일자리 본문 폰트
 * - FontSizeSettings 미리보기
 */

import { chromium, type Browser } from 'playwright'
import { readFileSync } from 'fs'
import { join } from 'path'

const BASE = 'https://age-doesnt-matter.com'

interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

const results: CheckResult[] = []

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail })
  const icon = pass ? '✅' : '❌'
  console.log(`${icon} ${name}: ${detail}`)
}

async function runChecks(browser: Browser) {
  const page = await browser.newPage()
  page.setDefaultTimeout(15000)

  // ── 1. 매거진 목록 — FeaturedCard/MagazineCard 폰트 클래스 ──
  console.log('\n── 매거진 목록 ──')
  await page.goto(`${BASE}/magazine`, { waitUntil: 'domcontentloaded' })
  const magPageHtml = await page.content()
  // text-title 클래스가 있어야 함 (FeaturedCard h3)
  check(
    '매거진 FeaturedCard: text-title 클래스',
    magPageHtml.includes('text-title'),
    magPageHtml.includes('text-title') ? '발견됨' : '미발견 (text-lg가 남아있을 수 있음)',
  )
  // text-sm이 제목 h3에 남아있으면 안됨
  const hasBadSmTitle = /class="[^"]*text-sm[^"]*font-bold[^"]*"/.test(magPageHtml)
  check(
    '매거진 MagazineCard: text-sm h3 제거 여부',
    !hasBadSmTitle,
    hasBadSmTitle ? 'text-sm font-bold h3 발견 (아직 남음)' : 'text-sm h3 없음 ✓',
  )

  // ── 2. 매거진 본문 — post-content text-body ──
  console.log('\n── 매거진 본문 ──')
  const magLinks = await page.$$eval('a[href^="/magazine/"]', (els) =>
    els.map((el) => (el as HTMLAnchorElement).href).filter((h) => /\/magazine\/[a-z0-9]+$/.test(h)),
  )
  if (magLinks.length > 0) {
    await page.goto(magLinks[0], { waitUntil: 'domcontentloaded' })
    const articleHtml = await page.content()
    const hasTextBody = /post-content text-body/.test(articleHtml) || /post-content[^"]*text-body/.test(articleHtml)
    const hasTextBase = /post-content text-base/.test(articleHtml)
    check(
      '매거진 본문: text-body 적용',
      hasTextBody && !hasTextBase,
      hasTextBase ? '❌ text-base 아직 남음' : hasTextBody ? 'text-body 발견' : '클래스 패턴 불일치',
    )

    // 실제 computed font-size 확인
    const bodyFontSize = await page.evaluate(() => {
      const el = document.querySelector('.post-content')
      if (!el) return null
      return window.getComputedStyle(el).fontSize
    })
    check(
      '매거진 본문: computed font-size ≥ 18px',
      bodyFontSize ? parseFloat(bodyFontSize) >= 18 : false,
      bodyFontSize ?? 'post-content 요소 없음',
    )
  } else {
    check('매거진 본문', false, '매거진 상세 링크 없음')
  }

  // ── 3. 일자리 본문 — post-content text-body ──
  console.log('\n── 일자리 본문 ──')
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' })
  const jobLinks = await page.$$eval('a[href^="/jobs/"]', (els) =>
    els.map((el) => (el as HTMLAnchorElement).href).filter((h) => /\/jobs\/[a-z0-9]+$/.test(h)),
  )
  if (jobLinks.length > 0) {
    await page.goto(jobLinks[0], { waitUntil: 'domcontentloaded' })
    const jobHtml = await page.content()
    const hasTextBody = /post-content text-body/.test(jobHtml) || /post-content[^"]*text-body/.test(jobHtml)
    const hasTextBase = /post-content text-base/.test(jobHtml)
    check(
      '일자리 본문: text-body 적용',
      hasTextBody && !hasTextBase,
      hasTextBase ? '❌ text-base 아직 남음' : hasTextBody ? 'text-body 발견' : '클래스 패턴 불일치',
    )
  } else {
    check('일자리 본문', false, '일자리 상세 링크 없음')
  }

  // ── 4. 글쓰기 페이지 — 로그인 없이 접근 시 redirect ──
  console.log('\n── 글쓰기 페이지 ──')
  await page.goto(`${BASE}/community/write`, { waitUntil: 'domcontentloaded' })
  const writeFinalUrl = page.url()
  check(
    '글쓰기: 미로그인 → /login 리다이렉트',
    writeFinalUrl.includes('/login'),
    writeFinalUrl,
  )

  // ── 5. 커뮤니티 게시글 본문 CSS 변수 확인 ──
  console.log('\n── 커뮤니티 게시글 ──')
  await page.goto(`${BASE}/community/stories`, { waitUntil: 'domcontentloaded' })
  const postLinks = await page.$$eval('a[href*="/community/stories/"]', (els) =>
    els.map((el) => (el as HTMLAnchorElement).href).filter((h) => /\/community\/stories\/[a-z0-9]+$/.test(h)),
  )
  if (postLinks.length > 0) {
    await page.goto(postLinks[0], { waitUntil: 'domcontentloaded' })
    // post-content 영역 font-size
    const postFontSize = await page.evaluate(() => {
      const el = document.querySelector('.post-content p') || document.querySelector('.post-content')
      if (!el) return null
      return window.getComputedStyle(el).fontSize
    })
    check(
      '커뮤니티 본문: computed font-size ≥ 18px',
      postFontSize ? parseFloat(postFontSize) >= 18 : false,
      postFontSize ?? 'post-content 없음',
    )
  } else {
    check('커뮤니티 본문 링크', false, '게시글 링크 없음')
  }

  // ── 6. globals.css — CSS 변수 정의 확인 (홈에서 root 변수 체크) ──
  console.log('\n── CSS 변수 ──')
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  const cssVarCheck = await page.evaluate(() => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    return {
      textBody: style.getPropertyValue('--text-body').trim(),
      textCaption: style.getPropertyValue('--text-caption').trim(),
      textTitle: style.getPropertyValue('--text-title').trim(),
      fontSizeBase: style.getPropertyValue('--font-size-base').trim(),
    }
  })
  check(
    'CSS --text-body 변수',
    cssVarCheck.textBody !== '',
    cssVarCheck.textBody || '미정의',
  )
  check(
    'CSS --font-size-base (HomePage 연결)',
    cssVarCheck.fontSizeBase !== '',
    cssVarCheck.fontSizeBase || '미정의',
  )

  // ── 7. TipTapEditor — SSR HTML에 에디터 마크업 없음 (클라이언트 전용) ──
  console.log('\n── TipTapEditor 패키지 ──')
  const pkgJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8')) as { dependencies?: Record<string, string> }
  const hasTipTapTextStyle = '@tiptap/extension-text-style' in (pkgJson.dependencies ?? {})
  check(
    '@tiptap/extension-text-style 패키지 설치',
    hasTipTapTextStyle,
    hasTipTapTextStyle ? pkgJson.dependencies['@tiptap/extension-text-style'] : '미설치',
  )

  // ── 8. Health API — 최신 버전 반영 ──
  console.log('\n── 배포 버전 ──')
  await page.goto(`${BASE}/api/health`, { waitUntil: 'domcontentloaded' })
  const healthText = await page.textContent('body')
  const healthJson = JSON.parse(healthText ?? '{}')
  check(
    '배포 버전 (2026.04.02 포함)',
    (healthJson.version ?? '').includes('2026.04.02'),
    healthJson.version ?? '버전 불명',
  )

  await page.close()
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    await runChecks(browser)
  } finally {
    await browser.close()
  }

  console.log('\n══════════════════════════════')
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  console.log(`결과: ${passed}/${results.length} 통과 / ${failed} 실패`)
  if (failed > 0) {
    console.log('\n실패 항목:')
    results.filter((r) => !r.pass).forEach((r) => console.log(`  ❌ ${r.name}: ${r.detail}`))
    process.exit(1)
  }
})()
