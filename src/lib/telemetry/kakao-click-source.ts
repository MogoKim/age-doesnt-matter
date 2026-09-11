/**
 * `kakao_button_click.from` — **사이트 전체** 카카오 로그인 시작 위치의 typed allowlist.
 *
 * ## 왜 allowlist 인가
 * `from` 은 호출부가 넘기는 자유 문자열이었다. 오타나 새 값이 들어오면 지표 축이 조용히 늘어나
 * "어디서 로그인을 시작했나"를 합산할 수 없게 된다. 값이 목록에 없으면 `unknown` 으로 접는다.
 *
 * ## 🔴 배너 클릭과 섞지 않는다
 * 가입 배너의 CTA 클릭은 `signup_banner_clicked` 로만 센다.
 * 이 목록에 배너 표면이 없는 것은 의도된 것이다 — `kakao_button_click` 을 배너 전환에 귀속하면
 * 로그인 화면·게스트 댓글 카드의 클릭까지 배너 성과로 잡힌다.
 * 두 지표는 **끝까지 별도로 유지**한다.
 */
export const KAKAO_CLICK_SOURCES = [
  /** `/login` 화면 */
  'login_page',
  /** 홈 중반부 가입 카드 */
  'home_signup_card',
  /** 랜딩 모달 */
  'landing_modal',
  /** 랜딩 하단 고정 바 */
  'landing_sticky_bar',
  /** `/about` FAQ 안 링크 */
  'about_faq',
  /** `/about` 중간 CTA */
  'about_mid_cta',
  /** `/about` 하단 CTA */
  'about_bottom_cta',
  /** 로그인 유도 모달 */
  'login_prompt_modal',
  /** 글쓰기 진입 시 로그인 유도 */
  'write_login_prompt',
  /** 비회원 댓글 등록 성공 후 카드 */
  'guest_comment_success',
  /** 호출부가 위치를 넘기지 않았다 — 집계에서 따로 본다 */
  'unknown',
] as const

export type KakaoClickSource = (typeof KAKAO_CLICK_SOURCES)[number]

const ALLOWED = new Set<string>(KAKAO_CLICK_SOURCES)

/** 목록 밖 값·빈 값은 전부 `unknown` 으로 접는다. 지표 축을 임의 문자열이 늘리지 못하게 한다. */
export function normalizeKakaoClickSource(raw: string | null | undefined): KakaoClickSource {
  return raw && ALLOWED.has(raw) ? (raw as KakaoClickSource) : 'unknown'
}
