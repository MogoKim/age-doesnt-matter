/**
 * `/api/events` rate limit 면제 목록 — **전환·측정 필수 이벤트만**.
 *
 * 면제하지 않으면 `page_view` 와 같은 버킷(`event:ip`, max 30)을 공유해 **429 로 조용히 유실**된다.
 * 퍼널 일부만 유실되면 단계 비율이 왜곡되므로, 한 퍼널은 계열 전체를 함께 면제한다.
 *
 * ⚠️ 이 목록은 `/api/events` 라우트와 어드민 판정(`admin.member-recovery.ts`)이 **같이** 참조한다.
 *    두 곳에 목록을 갈라 두면 "면제됐다고 표시되는데 실제로는 안 된" 상태가 생긴다.
 */

/** 면제 사유별 주석 — 왜 이 계열이 들어왔는지는 추가한 사람만 알 수 있으므로 여기 남긴다. */
const EXEMPT: readonly string[] = [
  // 가입 전환 본체
  'post_cta_clicked', 'sign_up', 'signup_step',
  // 락인 효과 측정 — 비회원 글뷰마다 발생
  'identity_banner_view', 'related_post_click',
  // A/B 실험 노출 = 분모. 글뷰마다 발생, 유실 시 3화면/D1 비율 왜곡
  'exp1_exposure',
  // 가입 배너 퍼널 — EventLog 단독 퍼널 보존
  'signup_banner_eligible', 'signup_banner_shown', 'signup_banner_clicked', 'signup_banner_dismissed',
  // 추천 v2 노출 = 분모
  'related_recommend_view',
  // 최상단 띠배너 퍼널 — 랜딩마다 shown 발생. signup_banner_* 와 별개 계열
  'top_promo_shown', 'top_promo_clicked', 'top_promo_dismissed',
  // Android 외부 브라우저 A/B — signup_banner_* 와 같은 시점에 발생
  'android_conversion_prompt_exposed', 'android_conversion_prompt_clicked', 'android_conversion_prompt_dismissed',
  // 인앱→외부브라우저 유도 — signup_banner_clicked 와 같은 클릭에서 함께 발생
  'inapp_redirect_attempted', 'inapp_redirect_opened', 'inapp_redirect_failed',
  // 댓글 퍼널 — comment_input_view 는 page_view 와 1:1 이 아니다
  'comment_input_view', 'comment_input_focus', 'comment_text_started', 'comment_identity_started',
  'comment_submit_attempted', 'comment_submit_failed', 'comment_signup_prompt_shown', 'comment_create',
  // ── r8-v2 추가 (2026-09-11) ──
  // 사이트 전체 카카오 로그인 시작. 아래 KAKAO_CLICK_EXEMPTION 참고.
  'kakao_button_click',
] as const

/**
 * `kakao_button_click` 면제 — **적용 이유와 계측 단절 시점**.
 *
 * 이 이벤트는 로그인 화면·홈 가입 카드·게스트 댓글 카드 등 **여러 표면**에서 발생한다.
 * 면제 목록에 없던 동안에는 `page_view` 와 같은 버킷(`event:ip`, max 30)을 써서
 * 같은 IP 에서 글을 여러 개 보고 로그인을 누른 방문자의 클릭이 **429 로 조용히 사라졌다.**
 * 따라서 **면제 이전 구간의 값은 하한값**이고, 이후 구간과 **같은 계열로 합산하면 안 된다.**
 *
 * 🔴 이것은 배너 전환 지표가 아니다. 배너 클릭은 `signup_banner_clicked` 로만 센다.
 */
export const KAKAO_CLICK_EXEMPTION = {
  eventName: 'kakao_button_click',
  reason:
    '로그인 화면·홈 가입 카드·게스트 댓글 카드 등 여러 표면에서 발생하는데 면제 목록에 없어 ' +
    '`page_view` 와 같은 버킷(event:ip, max 30)에서 429 로 유실돼 왔다. 면제 이전 값은 하한값이다.',
  /**
   * 계측 단절 시점 — 이 시각 **이전과 이후를 같은 계열로 합산하지 않는다.**
   * ⚠️ merge·production 배포 후 실측으로 채워 넣는다. `null` = 아직 기록되지 않음(배포 전이라는 뜻이 아니다).
   */
  effectiveFrom: null as string | null,
} as const

const EXEMPT_SET = new Set<string>(EXEMPT)

export function isRateLimitExemptEvent(eventName: string): boolean {
  return EXEMPT_SET.has(eventName)
}

/** 표시·문서용 — 목록 자체가 필요할 때만 쓴다. */
export const RATE_LIMIT_EXEMPT_EVENTS: readonly string[] = EXEMPT
