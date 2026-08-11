/**
 * 하단 댓글 진입점(CommentDock)을 **언제 보일지** 정하는 순수 판정.
 *
 * 왜 분리했나: 임계값이 4개라 컴포넌트 안에 두면 브라우저 없이는 검증할 수 없다.
 * 여기 두면 값 하나하나를 테스트로 고정할 수 있다.
 *
 * ## 배경 (C1-A 배포 후 실측)
 * Dock의 표시 조건이 "입력창이 화면 밖" 하나뿐이라 **글 최상단부터 계속 떠 있었다.**
 * 그 결과 스크롤 41지점 중 6지점에서 본문 광고를 덮었고, 최악은 `scrollY=129`(글 초반)에서
 * 광고 299px 중 69px(23%)를 잘라먹었다.
 * 진단: scratchpad/comment-dock-ad-overlap-diagnosis-2026-08-11/
 *
 * ## 고친 방향
 * 광고를 기준으로 피하지 않는다(광고 마크업에 의존하면 provider가 바뀔 때 조용히 깨진다).
 * **댓글을 쓸 맥락이 생겼을 때만** 보여준다.
 */

/**
 * 화면 절반은 스크롤해야 Dock이 등장할 수 있다.
 * 짧은 글에서 첫 화면부터 Dock이 뜨는 것을 막는 최소 조건이다 —
 * 짧은 글은 댓글 영역이 처음부터 "가까이" 있어서 근접 조건만으로는 즉시 노출된다.
 */
export const MIN_SCROLL_RATIO = 0.5

/**
 * 입력창이 화면 아래 이만큼 안으로 들어오면 "곧 댓글 영역"으로 본다.
 * 화면 높이 기준 비율이라 기기 크기에 따라 같이 늘어난다.
 */
export const NEAR_VIEWPORT_RATIO = 0.8

/**
 * 스크롤 가능 높이가 화면 3개분 이상이면 "긴 글".
 * 이보다 짧으면 읽기 진행률 조건을 쓰지 않는다 — 짧은 글에서 75%는 몇 번 스크롤이면 닿기 때문이다.
 */
export const LONG_DOC_MIN_SCREENS = 3

/** 긴 글에서 "충분히 읽었다"고 보는 진행률 */
export const READ_PROGRESS_THRESHOLD = 0.75

export interface DockVisibilityInput {
  /** 댓글 입력 영역의 뷰포트 기준 위치 */
  inputTop: number
  inputBottom: number
  viewportHeight: number
  scrollY: number
  /** document.documentElement.scrollHeight */
  documentHeight: number
}

export interface DockVisibilityResult {
  visible: boolean
  /** 입력창이 실제로 화면에 보이는가 — 가입 배너 지연 신호와 같은 값 */
  inputInView: boolean
  /** 왜 그렇게 판정했는지 (테스트·디버깅용) */
  reason:
    | 'input_in_view'      // 입력창이 보이니 Dock이 필요 없다
    | 'scrolled_past'      // 입력창을 지나쳤다 — 아래는 광고·추천글 구간
    | 'too_early'          // 아직 충분히 스크롤하지 않았다
    | 'not_near_yet'       // 댓글 영역이 아직 멀고, 긴 글 진행률도 못 넘었다
    | 'near_comment'       // 댓글 영역이 가까워졌다
    | 'read_enough'        // 긴 글을 충분히 읽었다
}

/**
 * Dock을 보일지 판정한다.
 *
 * 순서가 곧 우선순위다:
 *  1. 입력창이 보이면 숨긴다 (입력창이 둘로 보이는 혼란 방지 — C1-A부터 유지)
 *  2. 입력창을 **지나쳤으면** 숨긴다.
 *     이 사이트는 댓글 영역 아래에 CTA·추천글·광고가 더 있다. 거기서 Dock을 띄우면
 *     위로 되돌아가는 진입점으로서 쓸모도 적고 광고만 덮는다.
 *  3. 최소 스크롤 전에는 띄우지 않는다 (짧은 글 즉시 노출 방지)
 *  4. 그 다음에야 "근접" 또는 "긴 글 충분히 읽음" 중 하나를 만족하면 띄운다
 */
export function resolveDockVisibility(input: DockVisibilityInput): DockVisibilityResult {
  const { inputTop, inputBottom, viewportHeight, scrollY, documentHeight } = input

  const inputInView = inputBottom > 0 && inputTop < viewportHeight
  if (inputInView) return { visible: false, inputInView, reason: 'input_in_view' }

  if (inputBottom <= 0) return { visible: false, inputInView, reason: 'scrolled_past' }

  if (scrollY < viewportHeight * MIN_SCROLL_RATIO) {
    return { visible: false, inputInView, reason: 'too_early' }
  }

  const near = inputTop <= viewportHeight * (1 + NEAR_VIEWPORT_RATIO)
  if (near) return { visible: true, inputInView, reason: 'near_comment' }

  const scrollable = documentHeight - viewportHeight
  const isLongDoc = scrollable >= viewportHeight * LONG_DOC_MIN_SCREENS
  const progress = scrollable > 0 ? scrollY / scrollable : 1
  if (isLongDoc && progress >= READ_PROGRESS_THRESHOLD) {
    return { visible: true, inputInView, reason: 'read_enough' }
  }

  return { visible: false, inputInView, reason: 'not_near_yet' }
}
