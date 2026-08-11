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
 * 댓글 **섹션 시작**이 화면 아래 이만큼 안으로 들어오면 "곧 댓글 영역"으로 본다.
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
  /**
   * 댓글 **섹션 시작**("댓글 N개" 헤더)의 뷰포트 기준 top.
   *
   * 왜 입력창이 아니라 여기를 보는가:
   *   입력창은 댓글 목록 **아래**에 있다. 그래서 입력창을 기준으로 잡으면
   *   **댓글이 많을수록 Dock이 늦게 뜬다** — 목록 길이가 그대로 지연이 된다.
   *   실측(2026-08-11 프로덕션): 댓글 7개 글에서 입력창은 y=3587까지 밀렸고
   *   Dock은 scrollY=2086에서야 떴다. 첫 광고가 끝난 지점(722)보다 1364px 늦었다.
   *   같은 글의 댓글 섹션 시작은 y=1693(도달 scrollY=849)으로 첫 광고 끝과 거의 겹친다.
   *   사용자가 "댓글을 쓸 맥락"에 들어서는 순간은 목록 끝이 아니라 **목록 시작**이다.
   */
  sectionTop: number
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
    | 'not_near_yet'       // 댓글 섹션이 아직 멀고, 긴 글 진행률도 못 넘었다
    | 'near_comment'       // 댓글 섹션 시작이 가까워졌다
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
 *  4. 그 다음에야 "댓글 섹션 근접" 또는 "긴 글 충분히 읽음" 중 하나를 만족하면 띄운다
 *
 * [2026-08-11 보정] 4번의 "근접" 기준을 입력창 → **댓글 섹션 시작**으로 옮겼다.
 *   입력창은 댓글 목록 아래에 있어서, 댓글이 많은 글일수록 Dock이 늦게 떴다.
 */
export function resolveDockVisibility(input: DockVisibilityInput): DockVisibilityResult {
  const { inputTop, inputBottom, sectionTop, viewportHeight, scrollY, documentHeight } = input

  const inputInView = inputBottom > 0 && inputTop < viewportHeight
  if (inputInView) return { visible: false, inputInView, reason: 'input_in_view' }

  if (inputBottom <= 0) return { visible: false, inputInView, reason: 'scrolled_past' }

  if (scrollY < viewportHeight * MIN_SCROLL_RATIO) {
    return { visible: false, inputInView, reason: 'too_early' }
  }

  // 댓글 **섹션 시작**이 가까워지면 띄운다. 목록을 다 지나칠 때까지 기다리지 않는다.
  //   섹션이 이미 화면 위로 지나갔어도(음수) 참이다 — 목록을 읽는 내내 Dock이 남아 있어야
  //   "지금 한마디 쓰기"가 계속 손 닿는 곳에 있다. 목록 끝에서 입력창이 보이면 위 1번이 숨긴다.
  const near = sectionTop <= viewportHeight * (1 + NEAR_VIEWPORT_RATIO)
  if (near) return { visible: true, inputInView, reason: 'near_comment' }

  const scrollable = documentHeight - viewportHeight
  const isLongDoc = scrollable >= viewportHeight * LONG_DOC_MIN_SCREENS
  const progress = scrollable > 0 ? scrollY / scrollable : 1
  if (isLongDoc && progress >= READ_PROGRESS_THRESHOLD) {
    return { visible: true, inputInView, reason: 'read_enough' }
  }

  return { visible: false, inputInView, reason: 'not_near_yet' }
}
