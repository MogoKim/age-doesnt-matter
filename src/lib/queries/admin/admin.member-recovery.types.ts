/**
 * R8 회원 소생 — **화면 계약(타입)만** 모은 파일.
 *
 * 쿼리·계산에서 떼어낸 이유: 이 타입들은 어드민 화면과 주고받는 **모양**이라
 * 쿼리 구현이 바뀌어도 함께 흔들리면 안 된다. 여기만 보면 화면이 무엇을
 * 받는지 전부 알 수 있다.
 *
 * 기존 import 경로(`admin.member-recovery`)는 그대로 쓸 수 있다 — 그쪽에서 재수출한다.
 */
import type { QuadrantRetention } from './admin.retention'
import type { SignupBannerCtaType } from '@/lib/telemetry/signup-banner-cta'

export const MEMBER_RECOVERY_WINDOWS = [7, 30] as const
export type MemberRecoveryWindow = (typeof MEMBER_RECOVERY_WINDOWS)[number]

export function parseWindowDays(raw: string | undefined): MemberRecoveryWindow {
  return raw === '30' ? 30 : 7
}

/** 수집 상태 — **0 과 미수집을 절대 같은 칸에 넣지 않기 위한** 축. */
export type CollectionStatus =
  /** 이 단계를 재는 이벤트가 전 경로에 붙어 있다 */
  | 'COLLECTED'
  /** 일부 경로만 계측됐거나 유실 가능성이 있다 — 하한값으로 읽어야 한다 */
  | 'PARTIAL'
  /** 재는 이벤트가 아예 없다 — 0 이 아니라 '모른다' */
  | 'NOT_COLLECTED'

export interface FunnelStep {
  key: string
  label: string
  /**
   * **방문자 수**(세션 수가 아니다).
   * 식별자 `_anon_sid` 는 `maxAge = 30일` 쿠키라 한 사람이 여러 번 와도 같은 값이다.
   * `null` 이면 미수집 — 0 이 아니다.
   */
  visitors: number | null
  status: CollectionStatus
  note: string
}

export type RateStatus =
  | 'OK'
  /** 분모가 0 — 비율을 만들 수 없다(0% 가 아니다) */
  | 'NO_DENOM'
  /** 분자·분모 중 하나가 하한값이라 비율이 실제보다 낮/높을 수 있다 */
  | 'PARTIAL'

export interface Conversion {
  key: string
  label: string
  denom: number
  denomLabel: string
  numer: number
  numerLabel: string
  /** `null` = 판정 불가(분모 0). 0 과 구분한다 */
  rate: number | null
  status: RateStatus
  note: string
}

/**
 * 첫 참여는 **D1 기준**이다 — 가입 후 24시간 이내 작성만 성공으로 센다.
 * 기간을 열어두면 "언젠가는 썼다"가 섞여 첫 참여 실패가 가려진다.
 */
export interface ActivationCohort {
  /** 창 안에 가입한 실회원 전체 */
  cohortTotal: number
  /** 가입 후 24시간이 지나지 않아 아직 판정할 수 없는 인원 — 분모에서 뺀다 */
  immature: number
  /** 성숙 분모 = cohortTotal − immature */
  matureDenom: number
  wrotePostWithin24h: number
  wroteCommentWithin24h: number
  /** 분자 — 가입 후 24시간 이내에 글 또는 댓글을 쓴 사람 */
  wroteAnyWithin24h: number
  /** D1 은 실패했지만 그 뒤에 쓴 사람. **분자가 아니다** — 참고용으로만 센다 */
  wroteAnyLater: number
  rate: number | null
  status: RateStatus
  /** 첫 작성까지 걸린 시간의 중앙값(시간). 24시간 초과분도 포함한 관측값 */
  medianHoursToFirst: number | null
}

export interface ReplyLoop {
  /**
   * 창 안에 실회원이 쓴 살아있는 댓글.
   * **답글도 포함한다** — 답글 역시 댓글이고 거기에 다시 답글이 달릴 수 있다.
   * 최상위 댓글로 좁히면 대화가 이어진 스레드가 분모에서 빠져 루프율이 실제보다 높게 나온다.
   */
  memberComments: number
  /** 쓴 지 24시간이 안 돼 답글이 달릴 시간이 없었던 댓글 — 분모에서 뺀다 */
  immature: number
  matureDenom: number
  /** 분자 — **24시간 이내**에 **다른 실회원**의 답글을 받은 댓글 수 */
  gotReplyFromMember: number
  /** 다른 실회원의 답글이 있었으나 24시간을 넘겼다. 루프로 세지 않고 따로 본다 */
  lateMemberReply: number
  /** 답글이 전부 본인 것 */
  selfReplyOnly: number
  /** 답글이 전부 봇·비회원 */
  nonMemberReplyOnly: number
  /** 본인 답글과 봇·비회원 답글이 **섞인** 경우. 어느 한쪽으로 몰아 세면 오독된다 */
  selfAndNonMemberReply: number
  rate: number | null
  status: RateStatus
}

/**
 * `sign_up` **이벤트 수**와 **실제 가입자 수**는 다르다 — 섞어 읽으면 "가입에서 끊겼다"고 오판한다.
 * 완전성 판정은 **회원 ID 대조 하나뿐**이다. 건수 비교는 판정 근거가 아니다.
 */
export interface SignupEventCoverage {
  /** `sign_up` 이벤트를 낸 **방문자** 수(sessionId 기준) — 퍼널 단계와 같은 단위 */
  events: number
  /** `User.createdAt` 기준 실제 신규 실회원 수 — 이쪽이 사실이다 */
  actualNewMembers: number
  /** 코호트 회원 중 **자기 `userId` 가 붙은 `sign_up` 이벤트가 실제로 있는** 인원 */
  matchedMembers: number
  /** 코호트에 있으나 이벤트로 연결되지 않은 인원 */
  missingMembers: number
  /** `userId` 가 없거나 이 코호트가 아닌 `sign_up` 이벤트 수 — 누구의 가입인지 못 잇는다 */
  unlinkableEvents: number
  /** **matchedMembers / actualNewMembers**. 건수 비교가 아니다. 분모 0이면 null */
  rate: number | null
  status: 'OK' | 'PARTIAL' | 'GAP' | 'NO_DENOM'
}

/**
 * `signup_banner_eligible` 과 `signup_banner_shown` 은 **같은 `tryFire` 에서 연속 호출**되는
 * fire-and-forget POST 다. 서버 처리 순서가 뒤집힐 수 있어 **둘 사이에 전환율을 만들면 안 된다** —
 * 네트워크 경쟁을 전환 실패로 오독한다. 대신 **계측이 일관된지**만 본다.
 */
export interface BannerConsistency {
  eligibleVisitors: number
  shownVisitors: number
  /** 두 이벤트가 모두 있는 방문자 — 정상 */
  matched: number
  /** 적격만 있고 노출이 없는 방문자 — 전송 유실 의심 */
  eligibleOnly: number
  /** 노출만 있고 적격이 없는 방문자 — 전송 유실 의심 */
  shownOnly: number
}

/** 배너에서 실제로 무엇을 눌렀는지. `cta_type` 별 분해가 먼저고 카카오는 그 하위다. */
export interface BannerCtaBreakdown {
  /** 배너 CTA 를 하나라도 누른 방문자(모든 `cta_type`) */
  anyVisitors: number
  byType: {
    kakao_oauth: number
    app_install: number
    external_browser: number
    /** `cta_type` 이 없거나 위 셋이 아닌 클릭 */
    other: number
  }
}

/** r8-v2 CTA별 한 줄 — 분모(노출)와 분자(클릭)가 **같은 계측 버전**에서만 나온다. */
export interface BannerCtaTypeRow {
  ctaType: SignupBannerCtaType
  /** 이 CTA 를 **실제로 본** 방문자 (`signup_banner_shown` + `measurement_version=r8-v2`) */
  shownVisitors: number
  /** 그 노출 **이후에** 같은 CTA 를 누른 방문자 */
  clickedVisitors: number
  rate: number | null
  status: RateStatus
}

/**
 * r8-v2 CTA 퍼널 — **과거 계측과 절대 섞지 않는다.**
 *
 * 과거 `signup_banner_shown` 에는 CTA 종류가 없었다. 그 노출을 분모에 넣으면
 * "CTA 를 봤는데 안 눌렀다"와 "무엇을 봤는지 모른다"가 한 칸에 섞여 전환율이 구조적으로 낮아진다.
 * 그래서 v2 분모·분자는 **둘 다 `measurement_version=r8-v2`** 인 이벤트로만 만든다.
 */
export interface BannerCtaV2Funnel {
  measurementVersion: string
  /** 이 관측 창 안에서 v2 이벤트가 처음 보인 시각(ISO). `null` = 창 안에 v2 이벤트가 없다 */
  firstSeenInWindowAt: string | null
  /** v2 이벤트가 아직 없으면 `NOT_COLLECTED` — **0% 가 아니라 '모른다'** 다 */
  status: CollectionStatus
  rows: BannerCtaTypeRow[]
  /** v2 인데 `cta_type` 이 없는 노출 — 계측 결함이다 */
  shownWithoutCtaType: number
  /** v2 클릭인데 대응하는 v2 노출이 없는 방문자(배포 경계를 걸친 사람). **분자로 쓰지 않는다** */
  clickedWithoutV2Shown: number
  note: string
}

/**
 * 배포 이전 계측 — **합계로만** 본다.
 * CTA 종류가 없으므로 CTA별 분모를 복원할 수 없다. 비율을 만들지 않는다.
 */
export interface BannerCtaHistorical {
  shownVisitors: number
  clickedVisitors: number
  note: string
}

/**
 * 사이트 전체의 `kakao_button_click` — **배너 클릭이 아니다.**
 * 로그인 화면·게스트 댓글 카드 등 여러 표면에서 발생하므로 배너 전환에 귀속하지 않고 참고값으로만 둔다.
 *
 * 🔴 v2 와 미버전을 **하나의 7일/30일 숫자로 합치지 않는다.**
 *    이 이벤트는 r8-v2 부터 rate limit 면제라 그 이전 값은 429 로 유실된 **하한값**이다.
 *    배포 직후에도 캐시된 구버전 클라이언트가 미버전 이벤트를 계속 보내므로
 *    달력 시각이 아니라 **이벤트에 실린 `measurement_version`** 으로 가른다(보수적 분리).
 *    그래서 합계 필드를 아예 두지 않는다 — 두면 누군가 반드시 더한다.
 */
export interface SiteWideKakaoClick {
  /** `measurement_version=r8-v2` 를 달고 온 클릭 방문자 — rate limit 면제가 적용된 구간 */
  v2Visitors: number
  /** 미버전 클릭 방문자(배포 이전 + 캐시된 구버전 클라이언트). **하한값**이다 */
  historicalVisitors: number
  /** v2 가 아직 하나도 없으면 `NOT_COLLECTED` — 0 이 아니라 '모른다' */
  status: CollectionStatus
  /** 이 관측 창 안에서 v2 가 처음 보인 시각(ISO). 배포 시각 상수 대신 쓰는 정본 */
  firstSeenInWindowAt: string | null
  note: string
}

export interface MemberRetentionView {
  /** 어디서 온 값인지 명시 — 이 화면이 직접 계산한 값이 아니다 */
  source: string
  /** 기존 함수의 고정 관측 창 */
  sourceWindowDays: number
  quadrants: QuadrantRetention[]
  /** 채널 합산(TWA+WEB+UNKNOWN) */
  combined: QuadrantRetention | null
  note: string
}

export interface DataQualityNote {
  key: string
  level: 'OK' | 'WARN' | 'GAP'
  message: string
}

export interface MemberRecoveryData {
  generatedAt: string
  windowDays: number
  /** 실회원 계정 총계(어드민 제외) */
  realMemberTotal: number
  /** 창 안 신규 가입 실회원 */
  newMembers: number
  signupFunnel: {
    steps: FunnelStep[]
    conversions: Conversion[]
  }
  /** 퍼널 마지막 칸을 해석하기 전에 반드시 함께 읽는다 */
  signupEventCoverage: SignupEventCoverage
  /** 적격·노출은 전환이 아니라 계측 일관성으로 본다 */
  bannerConsistency: BannerConsistency
  /** 배너 반응은 CTA 전체가 먼저, 카카오는 하위 분해 (**전 기간 혼합 합계**) */
  bannerCta: BannerCtaBreakdown
  /** r8-v2 전용 CTA 퍼널 — CTA별 분모·분자는 여기서만 만든다 */
  bannerCtaV2: BannerCtaV2Funnel
  /** 배포 이전(미버전) 계측 — 합계로만 */
  bannerCtaHistorical: BannerCtaHistorical
  /** 배너와 무관한 사이트 전체 카카오 클릭 — 참고값 */
  siteWideKakaoClick: SiteWideKakaoClick
  activation: ActivationCohort
  replyLoop: ReplyLoop
  retention: MemberRetentionView
  dataQuality: DataQualityNote[]
}
