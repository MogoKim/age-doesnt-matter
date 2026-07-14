import type { Page } from '@playwright/test'

/**
 * 전역 팝업/바텀시트 optional 닫기 — CI blocker hotfix (2026-07-14)
 *
 * 배경: 투표 팝업(BottomSheet)·공지 팝업(PopupRenderer)이 새 브라우저 컨텍스트
 * (localStorage 없음 = "오늘 보지 않기" 기록 없음)에서 홈 진입 시 열려 fixed 오버레이가
 * 네비/검색 클릭을 pointer-events 인터셉트 → 01-home-navigation 3케이스 timeout 전멸.
 * (PR #122 CI에서 재현·프리뷰 프로브로 실증)
 *
 * 원칙: 앱 코드 무접촉 — 사용자 기능(팝업 노출)은 그대로 두고, 실제 사용자처럼
 * 닫기 버튼을 눌러 진행한다. 팝업이 없으면 아무것도 하지 않는다(optional).
 */
export async function dismissGlobalPopups(page: Page): Promise<void> {
  // 팝업은 클라 fetch(/api/popups, /api/votes/today) 후 뜨므로 잠깐의 등장 유예를 준다.
  const closeButtons = [
    page.getByRole('button', { name: '오늘은 그만 보기' }), // 투표 바텀시트 (VotePopup)
    page.getByRole('button', { name: '닫기', exact: true }), // 공지 팝업 공통 닫기 (PopupRenderer)
    page.getByRole('button', { name: /오늘 하루 안보기/ }),   // 공지 팝업 하루 숨김
  ]

  for (const btn of closeButtons) {
    const visible = await btn
      .first()
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false)
    if (visible) {
      await btn.first().click({ timeout: 3000 }).catch(() => {})
      // 닫힘 애니메이션/오버레이 해제 대기
      await page.waitForTimeout(400)
    }
  }

  // 안전망: 여전히 dialog가 남아 있으면 Escape 1회 (없으면 no-op)
  const dialogLeft = await page
    .locator('[role="dialog"]')
    .first()
    .isVisible()
    .catch(() => false)
  if (dialogLeft) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }
}
