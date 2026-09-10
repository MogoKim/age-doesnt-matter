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
  /** 세션 수. `null` 이면 미수집(0 이 아니다) */
  sessions: number | null
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

export interface ActivationCohort {
  /** 창 안에 가입한 실회원 전체 */
  cohortTotal: number
  /** 가입 후 24시간이 지나지 않아 아직 판정할 수 없는 인원 — 분모에서 뺀다 */
  immature: number
  /** 성숙 분모 = cohortTotal − immature */
  matureDenom: number
  wrotePost: number
  wroteComment: number
  wroteAny: number
  rate: number | null
  status: RateStatus
  /** 첫 작성까지 걸린 시간의 중앙값(시간). 작성자가 없으면 null */
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
  /** 그 중 **다른 실회원**의 답글을 받은 댓글 수 */
  gotReplyFromMember: number
  /** 답글은 받았으나 전부 본인 것 — 루프로 세지 않는다 */
  selfReplyOnly: number
  /** 답글은 받았으나 전부 봇·비회원 — 루프로 세지 않는다 */
  nonMemberReplyOnly: number
  rate: number | null
  status: RateStatus
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
 * 이벤트별 **세션 집합**. `groupBy` 라 DB 에서 중복이 제거된다 —
 * `page_view` 처럼 행이 많은 이벤트를 전부 끌어오지 않는다.
 */
async function sessionSet(
  where: Record<string, unknown>,
  internal: Set<string>,
): Promise<Set<string>> {
  const rows = await prisma.eventLog.groupBy({ by: ['sessionId'], where })
  const out = new Set<string>()
  for (const r of rows) {
    if (!r.sessionId) continue
    if (internal.has(r.sessionId)) continue // 창업자·어드민 세션 제외
    out.add(r.sessionId)
  }
  return out
}

const intersect = (a: Set<string>, b: Set<string>): number => {
  let n = 0
  for (const v of a) if (b.has(v)) n++
  return n
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

  const [visit, exposure, kakaoBtn, bannerKakao, signup] = await Promise.all([
    sessionSet({ ...base, eventName: 'page_view' }, internal),
    sessionSet({ ...base, eventName: 'signup_banner_shown' }, internal),
    sessionSet({ ...base, eventName: 'kakao_button_click' }, internal),
    sessionSet(
      { ...base, eventName: 'signup_banner_clicked', properties: { path: ['cta_type'], equals: 'kakao_oauth' } },
      internal,
    ),
    sessionSet({ ...base, eventName: 'sign_up' }, internal),
  ])

  // 로그인 시작 = 공용 CTA 버튼(kakao_button_click) ∪ 배너의 카카오 CTA
  const loginStart = new Set<string>([...kakaoBtn, ...bannerKakao])

  const steps: FunnelStep[] = [
    {
      key: 'visit',
      label: '방문',
      sessions: visit.size,
      status: 'COLLECTED',
      note: '`page_view` 세션 수(봇·내부 세션 제외)',
    },
    {
      key: 'exposure',
      label: '가입 유도 노출',
      sessions: exposure.size,
      status: 'COLLECTED',
      note: '`signup_banner_shown`. 앱 설치 유도(`android_conversion_prompt_*`)·띠배너(`top_promo_*`)는 가입 배너가 아니라 제외',
    },
    {
      key: 'login_start',
      label: '카카오 로그인 시작',
      sessions: loginStart.size,
      status: 'PARTIAL',
      note: '`kakao_button_click` ∪ `signup_banner_clicked{cta_type:kakao_oauth}`. `kakao_button_click` 은 rate limit 면제 목록에 없어 **유실 가능** → 하한값',
    },
    {
      key: 'signup_done',
      label: '가입 완료',
      sessions: signup.size,
      status: 'COLLECTED',
      note: '`sign_up` 이벤트 세션 수. 같은 창의 `User.createdAt` 기준 신규 실회원 수와 함께 본다',
    },
  ]

  const conversions: Conversion[] = [
    {
      key: 'visit_to_exposure',
      label: '방문 → 가입 유도 노출',
      denom: visit.size,
      denomLabel: '방문 세션',
      numer: intersect(exposure, visit),
      numerLabel: '노출된 방문 세션',
      rate: rateOf(intersect(exposure, visit), visit.size),
      status: visit.size > 0 ? 'OK' : 'NO_DENOM',
      note: '배너는 로그인·온보딩·어드민 경로에서 노출되지 않는다 — 100% 가 목표가 아니다',
    },
    {
      key: 'exposure_to_login_start',
      label: '가입 유도 노출 → 카카오 로그인 시작',
      denom: exposure.size,
      denomLabel: '노출 세션',
      numer: intersect(loginStart, exposure),
      numerLabel: '노출 후 로그인 시작 세션',
      rate: rateOf(intersect(loginStart, exposure), exposure.size),
      status: exposure.size > 0 ? 'PARTIAL' : 'NO_DENOM',
      note: '분자가 하한값(로그인 시작 이벤트 유실 가능) — 실제 비율은 이 값 이상',
    },
    {
      key: 'login_start_to_signup',
      label: '카카오 로그인 시작 → 가입 완료',
      denom: loginStart.size,
      denomLabel: '로그인 시작 세션',
      numer: intersect(signup, loginStart),
      numerLabel: '같은 세션에서 가입 완료',
      rate: rateOf(intersect(signup, loginStart), loginStart.size),
      status: loginStart.size > 0 ? 'PARTIAL' : 'NO_DENOM',
      note: '카카오 OAuth 왕복 중 세션이 갈리면 같은 세션으로 안 잡힌다 — 하한값',
    },
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
  let wrotePost = 0
  let wroteComment = 0
  let wroteAny = 0
  for (const u of matureCohort) {
    const p = firstPostAt.get(u.id)
    const c = firstCommentAt.get(u.id)
    if (p != null) wrotePost++
    if (c != null) wroteComment++
    const first = Math.min(p ?? Infinity, c ?? Infinity)
    if (Number.isFinite(first)) {
      wroteAny++
      hoursToFirst.push(Math.max(0, (first - u.createdAt.getTime()) / HOUR))
    }
  }

  const activation: ActivationCohort = {
    cohortTotal: cohort.length,
    immature: cohort.length - matureCohort.length,
    matureDenom: matureCohort.length,
    wrotePost,
    wroteComment,
    wroteAny,
    rate: rateOf(wroteAny, matureCohort.length),
    status: matureCohort.length > 0 ? 'OK' : 'NO_DENOM',
    medianHoursToFirst: median(hoursToFirst) != null ? Math.round((median(hoursToFirst) as number) * 10) / 10 : null,
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
        select: { parentId: true, authorId: true },
      })
    : []

  const realIdSet = new Set(realIds)
  const parentAuthor = new Map<string, string | null>()
  for (const c of matureComments) parentAuthor.set(c.id, c.authorId)

  const byMember = new Set<string>()
  const anyReply = new Set<string>()
  const selfOnlyCandidate = new Set<string>()
  for (const r of replies) {
    if (!r.parentId) continue
    anyReply.add(r.parentId)
    if (r.authorId && realIdSet.has(r.authorId)) {
      if (r.authorId === parentAuthor.get(r.parentId)) selfOnlyCandidate.add(r.parentId)
      else byMember.add(r.parentId) // 🔴 '다른' 실회원만 루프로 센다
    }
  }
  let selfReplyOnly = 0
  let nonMemberReplyOnly = 0
  for (const id of anyReply) {
    if (byMember.has(id)) continue
    if (selfOnlyCandidate.has(id)) selfReplyOnly++
    else nonMemberReplyOnly++
  }

  const replyLoop: ReplyLoop = {
    memberComments: memberComments.length,
    immature: memberComments.length - matureComments.length,
    matureDenom: matureComments.length,
    gotReplyFromMember: byMember.size,
    selfReplyOnly,
    nonMemberReplyOnly,
    rate: rateOf(byMember.size, matureComments.length),
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
              ? `이벤트가 실제 가입자의 절반에 못 미친다(${signup.size}/${cohort.length}) — **유실 의심**. 퍼널의 가입 완료 칸은 하한값으로 읽어라.`
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
