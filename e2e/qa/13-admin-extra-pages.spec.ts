import { test, expect } from '@playwright/test'

const ADMIN_AUTH = 'e2e/.auth/admin.json'

test.use({ storageState: ADMIN_AUTH })

test('어드민 에이전트 로그 페이지', async ({ page }) => {
  await page.goto('/admin/agents')
  await expect(page).not.toHaveTitle(/로그인/)
  const body = await page.textContent('body')
  // 통계 카드 or 로그 없음 메시지 중 하나
  const ok = body?.includes('오늘 실행') || body?.includes('로그가 없습니다')
  expect(ok).toBeTruthy()
  console.log('[agents] ✅ 렌더링 정상')
})

test('어드민 승인 대기 큐 페이지', async ({ page }) => {
  await page.goto('/admin/queue')
  await expect(page).not.toHaveTitle(/로그인/)
  const body = await page.textContent('body')
  const ok = body?.includes('대기 중') || body?.includes('승인됨')
  expect(ok).toBeTruthy()
  console.log('[queue] ✅ 렌더링 정상')
})

test('어드민 분석 페이지 (OKR)', async ({ page }) => {
  await page.goto('/admin/analytics')
  await expect(page).not.toHaveTitle(/로그인/)
  const body = await page.textContent('body')
  const ok = body?.includes('MAU') || body?.includes('DAU') || body?.includes('KR1')
  expect(ok).toBeTruthy()
  console.log('[analytics] ✅ OKR 위젯 렌더링 정상')
})

test('어드민 데일리 브리프 페이지', async ({ page }) => {
  await page.goto('/admin/daily-brief')
  await expect(page).not.toHaveTitle(/로그인/)
  const body = await page.textContent('body')
  // 욕망 지도 또는 데이터 없음 메시지
  const ok = body?.includes('욕망') || body?.includes('브리핑') || body?.includes('데이터가 없')
  expect(ok).toBeTruthy()
  console.log('[daily-brief] ✅ 렌더링 정상')
})
