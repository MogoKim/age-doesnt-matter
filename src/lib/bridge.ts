/**
 * Project BRIDGE — 우나어 → 소란소란(soransoran.com) 유도 링크의 단일 진실.
 *
 * 🔴 소란소란 링크를 하드코딩하지 마라. 반드시 `bridgeUrl(slot)` 을 쓴다.
 *    UTM 이 빠지면 소란소란 GA4 에서 출처를 구분할 수 없고,
 *    푸시·TopPromoBanner 는 referrer 자체가 없어 **"직접 유입"으로 100% 실종**된다.
 *    (우나어 Referrer-Policy = strict-origin-when-cross-origin,
 *     TopPromoBanner 는 rel="noopener noreferrer")
 *
 * 계측 정본은 소란소란 GA4(G-PW9HHV2LLL)다. 우나어 쪽에 BRIDGE 전용 계측은 만들지 않는다.
 * 상세: docs/operations/2026-09-22-project-bridge-charter.md
 */

export const SORANSORAN_ORIGIN = 'https://soransoran.com'

/** 유도 구좌. GA4 "세션 소스/매체" 에 `unao / <slot>` 으로 찍힌다. */
export type BridgeSlot =
  | 'popup'      // 목록·홈 모달 (읽기 화면에서는 뜨지 않는다)
  | 'homecard'   // 홈 중반부 카드
  | 'postdetail' // 글 상세 하단 인라인 카드 — SEO 유입의 주 착지점
  | 'footer'     // 푸터 상시 링크
  | 'topbanner'  // 최상단 띠배너 (어드민 설정)
  | 'push'       // 푸시·종알림 (어드민 발송)
  | 'hero'       // 홈 HERO 배너 (어드민 설정)
  | 'listad'     // 목록 배너 (어드민 설정)
  | 'detailad'   // 글 상세 배너 (어드민 설정)
  | 'notice'     // 공지 게시글

/** 소란소란 유도 URL. utm_source·utm_campaign 은 고정, utm_medium 만 구좌별로 바뀐다. */
export function bridgeUrl(slot: BridgeSlot): string {
  return `${SORANSORAN_ORIGIN}/?utm_source=unao&utm_medium=${slot}&utm_campaign=bridge`
}

/**
 * 공통 카피. 두 축을 겹친다 — "우나어가 만든 곳"(신뢰) + "지금은 글 쓰면 답이 달린다"(실익).
 *
 * 🚫 아래 표현은 영구 금지다:
 *   - "광고 없어요"        → 광고를 붙일 계획이 있다. 붙이는 순간 거짓이 된다.
 *   - "우나어가 소란소란으로 변경되었습니다" → 병행 운영이라 사실이 아니다.
 *   - 시니어·어르신·노인·실버 → 브랜드 금지어. 대체: "우리 또래", "40대 50대 여성".
 *
 * "지금은" 은 장치다. 사람이 늘어 댓글률이 떨어져도 거짓이 되지 않게 한다.
 */
export const BRIDGE_COPY = {
  name: '소란소란',
  /** 모달·카드 제목 */
  title: "새 커뮤니티 '소란소란'이 열렸어요",
  /** 우나어를 아는 사람(회원·기존 방문자)용 */
  bodyKnown: '우나어를 만든 사람들이 새로 연 곳이에요.',
  /** 공통 2번째 줄 */
  bodySub: '우리 또래 여성들이 모여서 이야기해요.',
  /** 실익 — 실측 근거(2026-09-22: 소란소란 댓글 10/5/3/2/1 vs 우나어 0) */
  hook: '지금은 글을 쓰면 답이 달려요.',
  /** 가입 장벽을 먼저 없앤다 */
  cta: '가입 없이 구경하기',
  ctaShort: '구경하러 가기',
  /** 병행 운영 — 우나어가 없어지는 게 아님을 반드시 알린다 */
  reassure: '우나어도 그대로 있습니다.',

  /**
   * 글 상세 하단용. 검색으로 글 하나 보러 온 사람이 **다 읽은 직후** 만나는 문구다.
   * 홈을 거치지 않으므로 이 자리가 SEO 유입의 유일한 접점이다.
   * 모달처럼 끊지 않고, 읽던 흐름을 이어 "다음 이야기"로 제안한다.
   */
  post: {
    title: '이런 이야기, 소란소란에도 있어요',
    body: '우나어를 만든 사람들이 새로 연 커뮤니티예요.',
    hook: '지금은 글을 쓰면 답이 달려요.',
    cta: '소란소란 구경하기',
  },
} as const
