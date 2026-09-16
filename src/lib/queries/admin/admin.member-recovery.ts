import { prisma } from '@/lib/prisma'
import { unstable_cache } from 'next/cache'
import { getInternalSessionIds, getAdminUserIds } from './internal-sessions'
import {
  SIGNUP_BANNER_CTA_TYPES,
  SIGNUP_BANNER_MEASUREMENT_VERSION,
  
} from '@/lib/telemetry/signup-banner-cta'
import { KAKAO_CLICK_EXEMPTION } from '@/lib/telemetry/event-rate-limit'

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

// 타입은 `admin.member-recovery.types`, 계산 단위는 `admin.member-recovery.compute` 로 나눴다.
// 기존 import 경로가 깨지지 않도록 여기서 전부 재수출한다.
export * from './admin.member-recovery.types'
export {
  DAY, isRealProviderId, rateOf, addSpan, visitorSpans, advancedAfter, unionSpans,
  computeActivation, computeRetentionView,
  type SpanMap,
} from './admin.member-recovery.compute'

import type {
   BannerConsistency, BannerCtaHistorical, BannerCtaTypeRow,
  BannerCtaV2Funnel, Conversion, DataQualityNote, FunnelStep, MemberRecoveryData,
   RateStatus, ReplyLoop, SignupEventCoverage,
} from './admin.member-recovery.types'
import {
  DAY, isRealProviderId, rateOf, addSpan, visitorSpans, advancedAfter, unionSpans,
  computeActivation, computeRetentionView, type SpanMap,
} from './admin.member-recovery.compute'


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

  /**
   * 🔴 비회원 방문 분모는 `userId IS NULL` 만으로 만들 수 없다.
   *
   * `onboarding.ts` 는 온보딩 완료 시
   * `eventLog.updateMany({ sessionId, userId: null }, { userId })` 로
   * **그 방문자의 과거 익명 이벤트에 userId 를 소급 입력**한다.
   * 그래서 `userId IS NULL` 로만 세면 **가입에 성공한 사람의 가입 전 방문이 통째로 빠진다** —
   * 전환에 성공한 쪽만 분모에서 사라져 전환율이 구조적으로 낮아진다.
   *
   * 판정 기준: **이벤트 시각이 그 계정의 `createdAt` 보다 이르면 "가입 전 방문"** 이므로 분모에 넣는다.
   * 반대로 계정 생성 이후의 방문(= 기존 회원의 재방문)은 가입 퍼널의 분모가 아니다.
   */
  const [anonVisit, attributedRows, eligible, exposure, kakaoBtn, bannerClickAny, signup] = await Promise.all([
    visitorSpans({ ...base, eventName: 'page_view', userId: null }, internal),
    prisma.eventLog.groupBy({
      by: ['sessionId', 'userId'],
      where: { ...base, eventName: 'page_view', userId: { not: null } },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    visitorSpans({ ...base, eventName: 'signup_banner_eligible' }, internal),
    visitorSpans({ ...base, eventName: 'signup_banner_shown' }, internal),
    visitorSpans({ ...base, eventName: 'kakao_button_click' }, internal),
    visitorSpans({ ...base, eventName: 'signup_banner_clicked' }, internal),
    visitorSpans({ ...base, eventName: 'sign_up' }, internal),
  ])

  // 배너 CTA 는 세 종류다. 카카오만 세면 앱 설치·외부 브라우저 클릭이 **배너 실패로 오독**된다.
  const [ctaKakao, ctaAppInstall, ctaExternal] = await Promise.all(
    (['kakao_oauth', 'app_install', 'external_browser'] as const).map((t) =>
      visitorSpans(
        { ...base, eventName: 'signup_banner_clicked', properties: { path: ['cta_type'], equals: t } },
        internal,
      ),
    ),
  )
  const knownCta = new Set([...ctaKakao.keys(), ...ctaAppInstall.keys(), ...ctaExternal.keys()])
  let ctaOther = 0
  for (const id of bannerClickAny.keys()) if (!knownCta.has(id)) ctaOther++

  // ───────── r8-v2 CTA 퍼널 — 과거 계측과 분리해서 계산한다 ─────────
  //
  // 🔴 분모도 분자도 **둘 다 r8-v2** 인 이벤트로만 만든다.
  //    과거 `signup_banner_shown` 에는 `cta_type` 이 없어 "무엇을 봤는지" 를 모른다.
  //    그 노출을 분모에 넣으면 모르는 것을 '안 눌렀다'로 세게 된다.
  const v2Where = (eventName: string, ctaType?: string) => {
    const AND: Record<string, unknown>[] = [
      { properties: { path: ['measurement_version'], equals: SIGNUP_BANNER_MEASUREMENT_VERSION } },
    ]
    if (ctaType) AND.push({ properties: { path: ['cta_type'], equals: ctaType } })
    return { ...base, eventName, AND }
  }

  const [v2ShownAll, v2ClickedAll, ...v2ByTypeFlat] = await Promise.all([
    visitorSpans(v2Where('signup_banner_shown'), internal),
    visitorSpans(v2Where('signup_banner_clicked'), internal),
    ...SIGNUP_BANNER_CTA_TYPES.flatMap((t) => [
      visitorSpans(v2Where('signup_banner_shown', t), internal),
      visitorSpans(v2Where('signup_banner_clicked', t), internal),
    ]),
  ])

  const v2Rows: BannerCtaTypeRow[] = SIGNUP_BANNER_CTA_TYPES.map((ctaType, i) => {
    const shown = v2ByTypeFlat[i * 2]
    const clicked = v2ByTypeFlat[i * 2 + 1]
    // 🔴 `advancedAfter` — 노출 **이후**의 클릭만 전환이다. 집합 교집합이 아니다.
    const numer = advancedAfter(shown, clicked)
    return {
      ctaType,
      shownVisitors: shown.size,
      clickedVisitors: numer,
      rate: rateOf(numer, shown.size),
      status: shown.size > 0 ? 'OK' : 'NO_DENOM',
    }
  })

  // v2 노출인데 cta_type 이 없는 것 — 계측 결함(빌더를 안 거친 경로가 남아 있다는 신호)
  const v2ShownTyped = new Set<string>()
  for (let i = 0; i < SIGNUP_BANNER_CTA_TYPES.length; i++) {
    for (const id of v2ByTypeFlat[i * 2].keys()) v2ShownTyped.add(id)
  }
  let v2ShownWithoutCtaType = 0
  for (const id of v2ShownAll.keys()) if (!v2ShownTyped.has(id)) v2ShownWithoutCtaType++

  // 배포 경계를 걸친 방문자 — 노출은 과거(미버전), 클릭은 v2.
  // 🔴 분자로 쓰지 않는다. 쓰면 분모 없는 전환이 만들어진다.
  let v2ClickedWithoutV2Shown = 0
  for (const id of v2ClickedAll.keys()) if (!v2ShownAll.has(id)) v2ClickedWithoutV2Shown++

  // 사이트 전체 카카오 클릭도 같은 방식으로 버전 분리한다 — **합산하지 않는다.**
  const kakaoBtnV2 = await visitorSpans(v2Where('kakao_button_click'), internal)

  const v2FirstMs = Math.min(
    ...[...v2ShownAll.values(), ...v2ClickedAll.values()].map((sp) => sp.first),
  )
  const v2Collected = v2ShownAll.size > 0 || v2ClickedAll.size > 0

  const kakaoFirstMs = Math.min(...[...kakaoBtnV2.values()].map((sp) => sp.first))
  const kakaoFirstAt = Number.isFinite(kakaoFirstMs) ? new Date(kakaoFirstMs).toISOString() : null

  const bannerCtaV2: BannerCtaV2Funnel = {
    measurementVersion: SIGNUP_BANNER_MEASUREMENT_VERSION,
    firstSeenInWindowAt: Number.isFinite(v2FirstMs) ? new Date(v2FirstMs).toISOString() : null,
    status: v2Collected ? 'COLLECTED' : 'NOT_COLLECTED',
    rows: v2Rows,
    shownWithoutCtaType: v2ShownWithoutCtaType,
    clickedWithoutV2Shown: v2ClickedWithoutV2Shown,
    note:
      '분모·분자 **양쪽 다** `measurement_version=r8-v2` 인 이벤트로만 만든다. ' +
      '배포 이전 노출에는 `cta_type` 이 없어 CTA별 분모를 복원할 수 없으므로 섞지 않는다 — ' +
      '섞으면 "무엇을 봤는지 모르는 노출"이 미전환으로 세어져 전환율이 구조적으로 낮아진다. ' +
      'v2 이벤트가 아직 없으면 **0% 가 아니라 미수집**이다.',
  }

  const bannerCtaHistorical: BannerCtaHistorical = {
    shownVisitors: exposure.size - v2ShownAll.size,
    clickedVisitors: bannerClickAny.size - v2ClickedAll.size,
    note:
      '배포 이전(미버전) 계측 — **합계로만** 읽는다. 노출에 CTA 종류가 없어 CTA별 분모를 만들 수 없다. ' +
      '배포 경계를 걸친 방문자(과거 노출 + v2 클릭)는 v2 쪽으로 세므로 이 합계에서는 빠진다.',
  }

  const joinedAt = new Map(allUsers.map((u) => [u.id, u.createdAt.getTime()]))
  const preSignupVisit: SpanMap = new Map()
  let excludedMemberVisitors = 0
  for (const r of attributedRows) {
    const sid = r.sessionId
    const uid = r.userId
    const a = r._min?.createdAt
    const b = r._max?.createdAt
    if (!sid || !uid || !a || !b) continue
    if (internal.has(sid)) continue
    const firstMs = a.getTime()
    const lastMs = b.getTime()
    const joined = joinedAt.get(uid)
    // 계정 생성 시각을 모르면(삭제 등) 가입 퍼널 분모에 넣지 않는다 — 보수적으로 뺀다.
    if (joined == null || firstMs >= joined) { excludedMemberVisitors++; continue }
    // 가입 전 방문이 있었다 → 분모에 포함. 구간은 가입 시각 이전까지로 본다.
    addSpan(preSignupVisit, sid, firstMs, Math.min(lastMs, joined))
  }
  const visit = unionSpans(anonVisit, preSignupVisit)

  // 🔴 사이트 전체 kakao_button_click 은 배너 클릭이 아니다(로그인 화면·게스트 댓글 카드 등).
  //    배너 전환에 귀속하지 않고 참고값으로만 둔다.
  const bannerCtaAny = bannerClickAny

  /**
   * 🔴 수집 완전성은 **건수 비교가 아니라 회원 ID 대조**다.
   * "이벤트 3건 · 신규 3명"이라도 서로 다른 사람이면 완전성은 100% 가 아니다.
   * 퍼널의 `sign_up` 단계(방문자=sessionId 기준)와는 **별개 지표**로 둔다.
   */
  const signUpUserRows = await prisma.eventLog.groupBy({
    by: ['userId'],
    where: { isBot: false, createdAt: { gte: since }, eventName: 'sign_up', userId: { not: null } },
  })
  const signUpUserIds = new Set(signUpUserRows.map((r) => r.userId).filter((v): v is string => !!v))
  const cohortIdSet = new Set(cohort.map((u) => u.id))
  let matchedMembers = 0
  for (const id of cohortIdSet) if (signUpUserIds.has(id)) matchedMembers++
  const missingMembers = cohortIdSet.size - matchedMembers
  // 연결 불가 = userId 가 없는 이벤트 + userId 는 있으나 이 코호트가 아닌 이벤트
  const signupWithoutUser = await visitorSpans({ ...base, eventName: 'sign_up', userId: null }, internal)
  let offCohortEvents = 0
  for (const id of signUpUserIds) if (!cohortIdSet.has(id)) offCohortEvents++
  const unlinkableEvents = signupWithoutUser.size + offCohortEvents

  const signupCoverageRate = rateOf(matchedMembers, cohortIdSet.size)
  const coverageStatus: SignupEventCoverage['status'] =
    cohortIdSet.size === 0
      ? 'NO_DENOM'
      : matchedMembers === 0
        ? 'GAP'
        : matchedMembers < cohortIdSet.size
          ? 'PARTIAL'
          : 'OK'

  // 적격·노출은 같은 tryFire 에서 나가므로 **순서를 믿을 수 없다.** 일치 여부만 센다.
  let consistencyMatched = 0
  for (const id of eligible.keys()) if (exposure.has(id)) consistencyMatched++
  const bannerConsistency: BannerConsistency = {
    eligibleVisitors: eligible.size,
    shownVisitors: exposure.size,
    matched: consistencyMatched,
    eligibleOnly: eligible.size - consistencyMatched,
    shownOnly: exposure.size - consistencyMatched,
  }

  const steps: FunnelStep[] = [
    {
      key: 'visit',
      label: '비회원 방문자',
      visitors: visit.size,
      status: 'COLLECTED',
      note: '`page_view` 중 **가입 전** 방문만 — `userId` 가 없거나, 있어도 이벤트 시각이 그 계정 생성보다 이른 것(온보딩이 소급 귀속한 분). 계정 생성 이후 방문(기존 회원 재방문)과 봇·내부 방문자는 제외',
    },
    {
      key: 'exposure',
      label: '가입 유도 노출',
      visitors: exposure.size,
      status: 'COLLECTED',
      note: '`signup_banner_shown`. 앱 설치 유도(`android_conversion_prompt_*`)·띠배너(`top_promo_*`)는 가입 배너가 아니라 제외',
    },
    {
      key: 'banner_cta',
      label: '배너 CTA 반응(전체)',
      visitors: bannerCtaAny.size,
      status: 'COLLECTED',
      note: '`signup_banner_clicked` **모든 `cta_type`** — 카카오 로그인·앱 설치·외부 브라우저. 카카오만 세면 나머지 클릭이 실패로 잡힌다',
    },
    {
      key: 'signup_done',
      label: '가입 완료(이벤트)',
      visitors: signup.size,
      // 🔴 이 칸을 사실로 읽으면 "가입에서 끊겼다"는 잘못된 결론이 나온다.
      //    완전성 판정은 ID 대조(signupEventCoverage) 하나뿐이다.
      status: coverageStatus === 'GAP' ? 'NOT_COLLECTED' : 'PARTIAL',
      note: `이벤트 기준이다. 실제 신규 실회원은 **${cohort.length}명**(\`User.createdAt\`). 수집 완전성은 ID 대조 지표로 본다`,
    },
  ]

  // 🔴 전환은 **순서가 있다.** 앞 단계 시각 이후에 다음 단계가 있어야 전환이다.
  //    단순 집합 교집합을 쓰면 "누른 뒤 배너를 본" 방문자까지 전환으로 세게 된다.
  const step = (
    key: string,
    label: string,
    from: SpanMap,
    fromLabel: string,
    to: SpanMap,
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

  // ⚠️ 「적격 → 노출」 전환율은 만들지 않는다 — 두 이벤트가 같은 tryFire 에서 연속 전송돼
  //    서버 기록 순서가 경쟁 조건이다. 대신 bannerConsistency 로 계측 일관성만 본다.
  const conversions: Conversion[] = [
    step('visit_to_exposure', '비회원 방문 → 가입 유도 노출', visit, '비회원 방문자', exposure, '이후 배너가 노출된 방문자', 'OK',
      '배너는 로그인·온보딩·어드민 경로에서 뜨지 않는다 — 100% 가 목표가 아니다'),
    step('exposure_to_banner_cta', '가입 유도 노출 → 배너 CTA 반응(전체)', exposure, '노출 방문자', bannerCtaAny, '이후 배너 CTA 를 누른 방문자', 'PARTIAL',
      '모든 `cta_type` 을 센다. **측정 버전 혼합 합계**다 — 배포 이전 분모에는 CTA 종류 정보가 없다. CTA별 분모·분자는 아래 r8-v2 표에서만 본다'),
    step('banner_kakao_to_signup', '배너 카카오 CTA → 가입 완료(이벤트)', ctaKakao, '카카오 CTA 를 누른 방문자', signup, '이후 가입 이벤트 발생', 'PARTIAL',
      '이벤트 기준이고 **측정 버전 혼합**이다. 카카오 OAuth 왕복으로 식별자가 갈리거나 이벤트가 유실되면 낮게 나온다 — **가입 실패로 읽지 마라**'),
  ]

  const activation = await computeActivation(cohort, now)

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

  const retention = await computeRetentionView()


  // ───────── 데이터 품질 ─────────
  const dataQuality: DataQualityNote[] = [
    {
      key: 'kakao_click_rate_limit_exempt',
      level: 'WARN',
      message:
        '사이트 전체 `kakao_button_click` 은 r8-v2 부터 `api/events` rate limit **면제** 대상이다. ' +
        `사유: ${KAKAO_CLICK_EXEMPTION.reason} ` +
        `🔴 **단절 기준은 달력 시각이 아니라 ${KAKAO_CLICK_EXEMPTION.separatedBy}** 다 — ` +
        '배포 직후에도 캐시된 구버전 클라이언트가 미버전 이벤트를 계속 보내므로 시각으로 자르면 섞인다. ' +
        '미버전 구간은 429 로 유실된 **하한값**이라 v2 와 하나의 숫자로 합산하지 않는다. ' +
        '배너 클릭(`signup_banner_clicked`)은 원래 면제라 영향이 없고, 여기에 귀속하지도 않는다.',
    },
    {
      key: 'exposure_cta_unknown',
      level: 'WARN',
      message:
        '**배포 이전** 노출(`signup_banner_shown`)에는 어떤 CTA 를 보여줬는지 정보가 없다. ' +
        '그래서 CTA별 전환율은 **과거 데이터로 복원할 수 없다** — backfill 하지 않는다. ' +
        'r8-v2 부터 노출에도 `cta_type` 이 실리며, CTA별 분모·분자는 **r8-v2 표에서만** 만든다. ' +
        '위 퍼널의 `exposure_to_banner_cta`·`banner_kakao_to_signup` 은 **측정 버전 혼합 합계**다.',
    },
    {
      key: 'eligible_is_quality_signal',
      level: 'OK',
      message:
        'v2 퍼널의 **노출 SSoT 는 `signup_banner_shown` 하나**다. `signup_banner_eligible` 은 같은 `tryFire` 에서 ' +
        '연속 전송되는 fire-and-forget POST 라 `createdAt` 도착 순서를 전환 순서로 읽을 수 없다 — ' +
        '그래서 **전 단계로 쓰지 않고** 전송 유실을 보는 과거 품질 신호로만 남긴다. ' +
        '유실 숫자를 맞추려고 재전송·중복 전송하지 않는다(같은 방문자를 두 번 세게 된다). ' +
        `현재 적격만 ${bannerConsistency.eligibleOnly}명 · 노출만 ${bannerConsistency.shownOnly}명.`,
    },
    {
      key: 'banner_vs_sitewide_click',
      level: 'OK',
      message:
        '배너 반응은 `signup_banner_clicked` 로만 센다. 사이트 전체 `kakao_button_click`(로그인 화면·게스트 댓글 카드 등)은 ' +
        '배너 클릭이 아니므로 **배너 전환에 귀속하지 않고** 참고값으로 따로 둔다.',
    },
    {
      key: 'oauth_session_split',
      level: 'WARN',
      message:
        '카카오 OAuth 는 외부 도메인을 왕복한다. 복귀 시 세션 식별자가 바뀌면 "로그인 시작 → 가입 완료"가 같은 세션으로 안 이어져 전환율이 실제보다 낮게 나온다.',
    },
    {
      key: 'signup_attribution',
      level: 'OK',
      message:
        `가입 퍼널 분모는 **비회원 방문**이다. \`onboarding.ts\` 가 가입 시 과거 익명 이벤트에 userId 를 소급 입력하므로, ` +
        `\`userId IS NULL\` 만 세면 **가입 성공자의 가입 전 방문이 빠진다**. 이벤트 시각이 계정 생성보다 이르면 분모에 포함했고, ` +
        `계정 생성 이후 방문(기존 회원의 재방문) **${excludedMemberVisitors}명분**은 제외했다.`,
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
    bannerConsistency,
    bannerCta: {
      anyVisitors: bannerCtaAny.size,
      byType: {
        kakao_oauth: ctaKakao.size,
        app_install: ctaAppInstall.size,
        external_browser: ctaExternal.size,
        other: ctaOther,
      },
    },
    bannerCtaV2,
    bannerCtaHistorical,
    siteWideKakaoClick: {
      v2Visitors: kakaoBtnV2.size,
      // 🔴 집합 차 — 같은 방문자가 두 버전을 다 냈으면 v2 쪽으로만 센다(중복 계상 방지).
      historicalVisitors: kakaoBtn.size - kakaoBtnV2.size,
      status: kakaoBtnV2.size > 0 ? 'COLLECTED' : 'NOT_COLLECTED',
      firstSeenInWindowAt: kakaoFirstAt,
      note:
        '배너 클릭이 아니다 — 로그인 화면·게스트 댓글 카드 등 사이트 전체의 카카오 버튼. 배너 전환에 귀속하지 않는다. ' +
        'r8-v2 와 미버전은 **합산하지 않는다** — 미버전 구간은 rate limit 면제 이전이라 429 로 유실된 하한값이고, ' +
        '배포 뒤에도 캐시된 구버전 클라이언트가 미버전 이벤트를 보내므로 시각이 아니라 이벤트 버전으로 가른다.',
    },
    signupEventCoverage: {
      events: signup.size,
      actualNewMembers: cohort.length,
      matchedMembers,
      missingMembers,
      unlinkableEvents,
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
  ['admin-member-recovery-v2'],
  { revalidate: 300 },
)

/** 테스트·재계산용 — 캐시를 거치지 않는다. */
export { computeMemberRecovery }
