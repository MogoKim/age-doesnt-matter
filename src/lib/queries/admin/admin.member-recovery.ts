import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getInternalSessionIds, getAdminUserIds } from './internal-sessions'
import { getRetentionQuadrants, type QuadrantRetention } from './admin.retention'

/**
 * R8 회원 소생 — **실회원이 어느 단계에서 끊기는지** 하나의 화면에서 본다.
 *
 * ## 왜 새로 만드나 (AS-IS 대조 결과)
 *
 * 이미 있는 것은 다시 만들지 않는다. 2026-09-10 전수 대조:
 *
 * | 구간 | 기존 | 판정 |
 * |---|---|---|
 * | 방문·가입 채널 | `admin.insights.ts` `channels` | 채널별 가입률만 — **퍼널 아님** |
 * | 가입 후 활동 | `admin.insights.ts` `activation` | `User.postCount>0` **누적 스냅샷** — 코호트·기간 없음 |
 * | 회원 D1~D30 | `admin.retention.ts` `getRetentionQuadrants()` | **이미 구현** → 그대로 재사용한다 |
 * | 가입 유도 → 로그인 시작 → 가입 완료 | 없음 | **신규** |
 * | 댓글 → 다른 실회원 답글 | 없음 | **신규** |
 *
 * 그래서 이 모듈은 **퍼널 연결(1단계)·코호트 활성화(2단계)·답글 루프(3단계)만** 계산하고,
 * 4단계(재방문)는 기존 함수를 호출해 붙인다.
 *
 * ## 판정 기준 (전 구간 공통)
 * - 실회원 = `providerId` 가 순수 숫자(`^\d+$`, 카카오 user ID) **AND** `role !== 'ADMIN'`
 * - 이벤트는 `isBot=false` 만
 * - 내부 세션(`/admin` 접근·`botType='founder'`)과 어드민 유저는 분모·분자 양쪽에서 제외
 * - 분모와 분자를 **항상 함께** 돌려준다. 비율만 보여주지 않는다
 * - **수집되지 않은 것과 0을 구분한다** — `status` 로 분리하고 `rate=null` 로 둔다
 * - 성숙하지 않은 코호트(행동할 시간이 없었던 대상)는 분모에서 빼고 별도로 센다
 */

const DAY = 86400000
const HOUR = 3600000

/** 실회원 판정 SSoT — 접두어 목록 방식은 7건 어긋난다(facts 2026-09-10 §2). */
const isRealProviderId = (pid: string | null | undefined) => /^\d+$/.test(pid ?? '')

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
 * production 실측(2026-09-10 30일): 이벤트 3 vs 실제 7.
 */
export interface SignupEventCoverage {
  /** `sign_up` 이벤트를 낸 방문자 수 */
  events: number
  /** `User.createdAt` 기준 실제 신규 실회원 수 — 이쪽이 사실이다 */
  actualNewMembers: number
  /** events / actualNewMembers. 분모 0이면 null */
  rate: number | null
  status: 'OK' | 'PARTIAL' | 'GAP' | 'NO_DENOM'
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
  activation: ActivationCohort
  replyLoop: ReplyLoop
  retention: MemberRetentionView
  dataQuality: DataQualityNote[]
}

const rateOf = (numer: number, denom: number): number | null =>
  denom > 0 ? Math.round((numer / denom) * 1000) / 10 : null

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * 이벤트별 **방문자 → 최초 발생 시각**. `groupBy` 라 DB 에서 집계되므로
 * `page_view` 처럼 행이 많은 이벤트를 전부 끌어오지 않는다.
 *
 * 최초 시각이 필요한 이유: 퍼널은 **순서가 있는** 전환이다.
 * 단순 집합 교집합은 "배너를 본 뒤 눌렀다"와 "누른 뒤 배너를 봤다"를 구분하지 못한다.
 */
async function visitorFirstAt(
  where: Record<string, unknown>,
  internal: Set<string>,
): Promise<Map<string, number>> {
  const rows = await prisma.eventLog.groupBy({ by: ['sessionId'], where, _min: { createdAt: true } })
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.sessionId) continue
    if (internal.has(r.sessionId)) continue // 창업자·어드민 방문자 제외
    const t = r._min?.createdAt
    if (!t) continue
    out.set(r.sessionId, t.getTime())
  }
  return out
}

/** 앞 단계를 밟은 방문자 중, **그 시각 이후에** 다음 단계를 밟은 수. */
function advancedAfter(from: Map<string, number>, to: Map<string, number>): number {
  let n = 0
  for (const [id, t0] of from) {
    const t1 = to.get(id)
    if (t1 != null && t1 >= t0) n++
  }
  return n
}

/** 두 이벤트 계열의 합집합 — 방문자별로 **더 이른** 시각을 취한다. */
function earliestUnion(...maps: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of maps) {
    for (const [id, t] of m) {
      const cur = out.get(id)
      if (cur == null || t < cur) out.set(id, t)
    }
  }
  return out
}

async function computeMemberRecovery(windowDays: number): Promise<MemberRecoveryData> {
  const now = Date.now()
  const since = new Date(now - windowDays * DAY)

  const [internal, adminIds, allUsers] = await Promise.all([
    getInternalSessionIds(since),
    getAdminUserIds(),
    prisma.user.findMany({ select: { id: true, providerId: true, role: true, createdAt: true } }),
  ])

  const realUsers = allUsers.filter((u) => isRealProviderId(u.providerId) && u.role !== 'ADMIN' && !adminIds.has(u.id))
  const realIds = realUsers.map((u) => u.id)
  const cohort = realUsers.filter((u) => u.createdAt >= since)

  // ───────── 1단계: 방문 → 가입 유도 노출 → 카카오 로그인 시작 → 가입 완료 ─────────
  const base = { isBot: false, createdAt: { gte: since }, sessionId: { not: null } } as const

  const [visit, eligible, exposure, kakaoBtn, bannerKakao, signup] = await Promise.all([
    // 🔴 가입 퍼널의 분모는 **비회원 방문**이다. 이미 로그인한 회원의 방문을 넣으면
    //    분모가 부풀어 "가입 유도 노출률"이 실제보다 낮게 보인다.
    visitorFirstAt({ ...base, eventName: 'page_view', userId: null }, internal),
    visitorFirstAt({ ...base, eventName: 'signup_banner_eligible' }, internal),
    visitorFirstAt({ ...base, eventName: 'signup_banner_shown' }, internal),
    visitorFirstAt({ ...base, eventName: 'kakao_button_click' }, internal),
    visitorFirstAt(
      { ...base, eventName: 'signup_banner_clicked', properties: { path: ['cta_type'], equals: 'kakao_oauth' } },
      internal,
    ),
    visitorFirstAt({ ...base, eventName: 'sign_up' }, internal),
  ])

  // 로그인 시작 = 공용 CTA 버튼(kakao_button_click) ∪ 배너의 카카오 CTA
  const loginStart = earliestUnion(kakaoBtn, bannerKakao)

  const signupCoverageRate = rateOf(signup.size, cohort.length)
  const coverageStatus: SignupEventCoverage['status'] =
    cohort.length === 0 ? 'NO_DENOM' : signup.size === 0 ? 'GAP' : signup.size < cohort.length ? 'PARTIAL' : 'OK'

  const steps: FunnelStep[] = [
    {
      key: 'visit',
      label: '비회원 방문자',
      visitors: visit.size,
      status: 'COLLECTED',
      note: '`page_view` 중 `userId` 가 없는 것만 — 이미 로그인한 회원은 가입 퍼널의 분모가 아니다. 봇·내부 방문자 제외',
    },
    {
      key: 'eligible',
      label: '가입 유도 적격',
      visitors: eligible.size,
      status: 'COLLECTED',
      note: '`signup_banner_eligible` — 배너 노출 조건을 만족한 방문자. 노출 직전 단계라 "보여줄 수 있었는데 안 보여준" 구간이 여기서 드러난다',
    },
    {
      key: 'exposure',
      label: '가입 유도 노출',
      visitors: exposure.size,
      status: 'COLLECTED',
      note: '`signup_banner_shown`. 앱 설치 유도(`android_conversion_prompt_*`)·띠배너(`top_promo_*`)는 가입 배너가 아니라 제외',
    },
    {
      key: 'login_start',
      label: '카카오 로그인 시작',
      visitors: loginStart.size,
      status: 'PARTIAL',
      note: '`kakao_button_click` ∪ `signup_banner_clicked{cta_type:kakao_oauth}`. `kakao_button_click` 은 rate limit 면제 목록에 없어 **유실 가능** → 하한값',
    },
    {
      key: 'signup_done',
      label: '가입 완료(이벤트)',
      visitors: signup.size,
      // 🔴 실측상 이벤트가 실제 가입자보다 적다. 절대 COLLECTED 로 표시하지 않는다 —
      //    이 칸을 사실로 읽으면 "가입에서 끊겼다"는 잘못된 결론이 나온다.
      status: coverageStatus === 'GAP' ? 'NOT_COLLECTED' : 'PARTIAL',
      note: `이벤트 기준이다. 실제 신규 실회원은 **${cohort.length}명**(\`User.createdAt\`). 수집 완전성은 별도 지표로 본다`,
    },
  ]

  // 🔴 전환은 **순서가 있다.** 앞 단계 시각 이후에 다음 단계가 있어야 전환이다.
  //    단순 집합 교집합을 쓰면 "누른 뒤 배너를 본" 방문자까지 전환으로 세게 된다.
  const step = (
    key: string,
    label: string,
    from: Map<string, number>,
    fromLabel: string,
    to: Map<string, number>,
    toLabel: string,
    status: RateStatus,
    note: string,
  ): Conversion => {
    const numer = advancedAfter(from, to)
    return {
      key, label,
      denom: from.size, denomLabel: fromLabel,
      numer, numerLabel: toLabel,
      rate: rateOf(numer, from.size),
      status: from.size > 0 ? status : 'NO_DENOM',
      note,
    }
  }

  const conversions: Conversion[] = [
    step('visit_to_eligible', '비회원 방문 → 가입 유도 적격', visit, '비회원 방문자', eligible, '이후 적격이 된 방문자', 'OK',
      '배너는 로그인·온보딩·어드민 경로에서 뜨지 않는다 — 100% 가 목표가 아니다'),
    step('eligible_to_exposure', '가입 유도 적격 → 노출', eligible, '적격 방문자', exposure, '이후 실제로 노출된 방문자', 'OK',
      '적격인데 노출이 안 됐다면 배너 노출 조건·타이밍을 본다'),
    step('exposure_to_login_start', '가입 유도 노출 → 카카오 로그인 시작', exposure, '노출 방문자', loginStart, '노출 이후 로그인 시작', 'PARTIAL',
      '분자가 하한값(로그인 시작 이벤트 유실 가능) — 실제 비율은 이 값 이상'),
    step('login_start_to_signup', '카카오 로그인 시작 → 가입 완료(이벤트)', loginStart, '로그인 시작 방문자', signup, '이후 가입 이벤트 발생', 'PARTIAL',
      '이벤트 기준이다. 카카오 OAuth 왕복으로 식별자가 갈리거나 이벤트가 유실되면 낮게 나온다 — **가입 실패로 읽지 마라**'),
  ]

  // ───────── 2단계: 가입 → 첫 글 또는 첫 댓글 ─────────
  const cohortIds = cohort.map((u) => u.id)
  const [firstPosts, firstComments] = await Promise.all([
    cohortIds.length
      ? prisma.post.groupBy({ by: ['authorId'], where: { authorId: { in: cohortIds } }, _min: { createdAt: true } })
      : Promise.resolve([] as { authorId: string; _min: { createdAt: Date | null } }[]),
    cohortIds.length
      ? prisma.comment.groupBy({ by: ['authorId'], where: { authorId: { in: cohortIds } }, _min: { createdAt: true } })
      : Promise.resolve([] as { authorId: string | null; _min: { createdAt: Date | null } }[]),
  ])

  const firstPostAt = new Map<string, number>()
  for (const r of firstPosts) if (r._min.createdAt) firstPostAt.set(r.authorId, r._min.createdAt.getTime())
  const firstCommentAt = new Map<string, number>()
  for (const r of firstComments) if (r.authorId && r._min.createdAt) firstCommentAt.set(r.authorId, r._min.createdAt.getTime())

  // 가입 직후는 '아직 안 썼다'가 아니라 '판정할 시간이 없었다'
  const matureCohort = cohort.filter((u) => now - u.createdAt.getTime() >= DAY)
  const hoursToFirst: number[] = []
  let wrotePostWithin24h = 0
  let wroteCommentWithin24h = 0
  let wroteAnyWithin24h = 0
  let wroteAnyLater = 0
  for (const u of matureCohort) {
    const joined = u.createdAt.getTime()
    const p = firstPostAt.get(u.id)
    const c = firstCommentAt.get(u.id)
    // 🔴 D1 기준 — 가입 시각으로부터 24시간 이내만 성공이다.
    //    기간을 열어두면 "언젠가는 썼다"가 섞여 첫 참여 실패가 가려진다.
    if (p != null && p - joined <= DAY) wrotePostWithin24h++
    if (c != null && c - joined <= DAY) wroteCommentWithin24h++
    const first = Math.min(p ?? Infinity, c ?? Infinity)
    if (Number.isFinite(first)) {
      hoursToFirst.push(Math.max(0, (first - joined) / HOUR))
      if (first - joined <= DAY) wroteAnyWithin24h++
      else wroteAnyLater++
    }
  }
  const medianHours = median(hoursToFirst)

  const activation: ActivationCohort = {
    cohortTotal: cohort.length,
    immature: cohort.length - matureCohort.length,
    matureDenom: matureCohort.length,
    wrotePostWithin24h,
    wroteCommentWithin24h,
    wroteAnyWithin24h,
    wroteAnyLater,
    rate: rateOf(wroteAnyWithin24h, matureCohort.length),
    status: matureCohort.length > 0 ? 'OK' : 'NO_DENOM',
    medianHoursToFirst: medianHours != null ? Math.round(medianHours * 10) / 10 : null,
  }

  // ───────── 3단계: 실회원 댓글 → 다른 실회원의 답글 ─────────
  const memberComments = realIds.length
    ? await prisma.comment.findMany({
        where: { authorId: { in: realIds }, createdAt: { gte: since }, status: 'ACTIVE' },
        select: { id: true, authorId: true, createdAt: true },
      })
    : []

  const matureComments = memberComments.filter((c) => now - c.createdAt.getTime() >= DAY)
  const matureIds = matureComments.map((c) => c.id)
  const replies = matureIds.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: matureIds }, status: 'ACTIVE' },
        // 🔴 createdAt 을 반드시 읽는다 — 24시간 안에 왔는지 판정해야 한다.
        select: { parentId: true, authorId: true, createdAt: true },
      })
    : []

  const realIdSet = new Set(realIds)
  const parentAt = new Map<string, number>()
  const parentAuthor = new Map<string, string | null>()
  for (const c of matureComments) {
    parentAt.set(c.id, c.createdAt.getTime())
    parentAuthor.set(c.id, c.authorId)
  }

  /** 댓글별로 어떤 답글이 왔는지 분해한다. 한쪽으로 몰아 세지 않기 위해서다. */
  const kinds = new Map<string, { inTime: boolean; lateMember: boolean; self: boolean; nonMember: boolean }>()
  for (const r of replies) {
    if (!r.parentId) continue
    const t0 = parentAt.get(r.parentId)
    if (t0 == null) continue
    const k = kinds.get(r.parentId) ?? { inTime: false, lateMember: false, self: false, nonMember: false }
    const within24h = r.createdAt.getTime() - t0 <= DAY
    if (r.authorId && realIdSet.has(r.authorId) && r.authorId !== parentAuthor.get(r.parentId)) {
      // 다른 실회원의 답글 — 24시간 안에 온 것만 루프로 센다
      if (within24h) k.inTime = true
      else k.lateMember = true
    } else if (r.authorId && r.authorId === parentAuthor.get(r.parentId)) {
      k.self = true
    } else {
      k.nonMember = true // 봇 또는 비회원(authorId NULL)
    }
    kinds.set(r.parentId, k)
  }

  let gotReplyFromMember = 0
  let lateMemberReply = 0
  let selfReplyOnly = 0
  let nonMemberReplyOnly = 0
  let selfAndNonMemberReply = 0
  for (const k of kinds.values()) {
    if (k.inTime) { gotReplyFromMember++; continue }
    if (k.lateMember) { lateMemberReply++; continue }
    // 🔴 본인·봇이 섞였는데 '본인 답글뿐'으로 표시하면 오독된다 — 별도 칸으로 센다.
    if (k.self && k.nonMember) selfAndNonMemberReply++
    else if (k.self) selfReplyOnly++
    else if (k.nonMember) nonMemberReplyOnly++
  }

  const replyLoop: ReplyLoop = {
    memberComments: memberComments.length,
    immature: memberComments.length - matureComments.length,
    matureDenom: matureComments.length,
    gotReplyFromMember,
    lateMemberReply,
    selfReplyOnly,
    nonMemberReplyOnly,
    selfAndNonMemberReply,
    rate: rateOf(gotReplyFromMember, matureComments.length),
    status: matureComments.length > 0 ? 'OK' : 'NO_DENOM',
  }

  // ───────── 4단계: 재방문 — 기존 구현 재사용 ─────────
  const retentionData = await getRetentionQuadrants()
  const members = retentionData.members
  const sum = (pick: (q: QuadrantRetention) => { denom: number; returned: number }) => {
    let denom = 0
    let returned = 0
    for (const q of members) {
      denom += pick(q).denom
      returned += pick(q).returned
    }
    return { denom, returned, rate: rateOf(returned, denom) }
  }
  const combined: QuadrantRetention | null = members.length
    ? {
        segment: '전체(채널 합산)',
        d1: sum((q) => q.d1),
        d3: sum((q) => q.d3),
        d7: sum((q) => q.d7),
        d14: sum((q) => q.d14),
        d30: sum((q) => q.d30),
      }
    : null

  const retention: MemberRetentionView = {
    source: 'admin.retention.ts · getRetentionQuadrants()',
    sourceWindowDays: retentionData.windowDays,
    quadrants: members,
    combined,
    note:
      '**신규 실회원(가입 코호트)만** 표시한다. 같은 함수가 돌려주는 비회원 리텐션은 정의(코호트=첫 page_view일)가 달라 이 화면에 섞지 않는다. ' +
      'D-N 분모는 가입 후 N일이 실제로 지난 성숙 코호트뿐이라 위 7·30일 창과 별개로 90일 창을 쓴다 — D7 은 7일이 지나야 판정할 수 있기 때문이다.',
  }

  // ───────── 데이터 품질 ─────────
  const dataQuality: DataQualityNote[] = [
    {
      key: 'login_start_rate_limit',
      level: 'WARN',
      message:
        '`kakao_button_click` 이 `api/events` 의 rate limit 면제 목록(CONVERSION_EVENTS)에 없다. ' +
        '`page_view` 와 같은 버킷(event:ip, max 30)을 써서 429 로 조용히 유실될 수 있다 → 로그인 시작은 **하한값**이다.',
    },
    {
      key: 'oauth_session_split',
      level: 'WARN',
      message:
        '카카오 OAuth 는 외부 도메인을 왕복한다. 복귀 시 세션 식별자가 바뀌면 "로그인 시작 → 가입 완료"가 같은 세션으로 안 이어져 전환율이 실제보다 낮게 나온다.',
    },
    {
      key: 'visitor_id_semantics',
      level: 'OK',
      message:
        '퍼널의 단위는 **방문자**다. 식별자 `_anon_sid` 는 `maxAge = 30일` 쿠키라 한 사람이 여러 번 와도 같은 값이다 — ' +
        '"세션"으로 읽으면 방문 횟수로 오해한다. 쿠키·localStorage 를 지우거나 기기를 바꾸면 다른 방문자로 잡힌다.',
    },
    {
      key: 'funnel_ordering',
      level: 'OK',
      message:
        '전환은 **시간 순서**로 센다 — 앞 단계 최초 발생 이후에 다음 단계가 있어야 전환이다. ' +
        '집합 교집합이 아니라서 "누른 뒤 배너를 본" 방문자는 전환에 들어가지 않는다.',
    },
    {
      key: 'signup_cross_check',
      // 🔴 이벤트 0 만 잡으면 부족하다. production 실측(2026-09-10): 30일 신규 실회원 7명 vs
      //    `sign_up` 이벤트 3건 — 절반 이상 유실인데도 "0 이 아니니 정상"으로 넘어갔다.
      //    그래서 **비율로도** 판정한다. 기준은 절반이다.
      level:
        cohort.length === 0
          ? 'OK'
          : signup.size === 0
            ? 'GAP'
            : signup.size < cohort.length / 2
              ? 'WARN'
              : 'OK',
      message:
        `창 안 \`sign_up\` 이벤트 세션 ${signup.size}건 · \`User.createdAt\` 기준 신규 실회원 ${cohort.length}명. ` +
        (cohort.length === 0
          ? '가입자가 없어 대조할 것이 없다.'
          : signup.size === 0
            ? '이벤트가 0인데 실제 가입자가 있다 — **이벤트 미수집**이므로 퍼널 마지막 칸을 0% 로 읽지 마라.'
            : signup.size < cohort.length / 2
              ? `이벤트가 실제 가입자의 절반에 못 미친다(${signup.size}/${cohort.length}) — **유실 의심**. 퍼널의 가입 완료 칸은 하한값이며, 이것을 "가입에서 끊겼다"로 읽으면 안 된다.`
              : '두 값이 크게 어긋나지 않는다.'),
    },
    {
      key: 'immature_excluded',
      level: 'OK',
      message:
        `성숙 전 제외 — 가입 24시간 미경과 ${activation.immature}명, 작성 24시간 미경과 댓글 ${replyLoop.immature}건은 분모에서 뺐다(실패가 아니다).`,
    },
    {
      key: 'internal_excluded',
      level: 'OK',
      message: `내부 세션 ${internal.size}개(\`/admin\` 접근·founder 플래그)와 어드민 계정 ${adminIds.size}개를 분모·분자에서 제외했다.`,
    },
  ]

  return {
    generatedAt: new Date(now).toISOString(),
    windowDays,
    realMemberTotal: realUsers.length,
    newMembers: cohort.length,
    signupFunnel: { steps, conversions },
    signupEventCoverage: {
      events: signup.size,
      actualNewMembers: cohort.length,
      rate: signupCoverageRate,
      status: coverageStatus,
    },
    activation,
    replyLoop,
    retention,
    dataQuality,
  }
}

/** 화면용 — 어드민 1인 트래픽이라 짧게 캐시한다. 인자는 캐시 키에 포함된다. */
export const getMemberRecovery = unstable_cache(
  (windowDays: number) => computeMemberRecovery(windowDays),
  ['admin-member-recovery-v1'],
  { revalidate: 300 },
)

/** 테스트·재계산용 — 캐시를 거치지 않는다. */
export { computeMemberRecovery }
