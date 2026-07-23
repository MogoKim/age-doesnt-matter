import { prisma } from '@/lib/prisma'
import { getKstToday } from '@/lib/votes'
import type { Event } from '@/generated/prisma/client'

/**
 * Event 오케스트레이션 계층 — 노출 resolver (Phase 1 기반)
 *
 * ⚠️ `getExposedEvent`는 **fallback을 하지 않는다.**
 *  - Event 테이블만 조회한다.
 *  - 조건에 맞는 Event가 없으면 **null**을 반환한다.
 *
 * Phase 2에서 `resolveChannelVote(channel)`가 이 위에 fallback/타입차단 정책을 얹어
 * 팝업/HERO의 "노출 대상 선택"을 담당한다.
 */

/** 팝업/HERO 노출 채널 */
export type EventChannel = 'bottomPopup' | 'hero'

/** 노출 대상 뷰어(로그인 여부). audience 분리 노출용 — undefined면 audience 필터 안 함(VOTE/FEEDBACK 등 ALL 전용 경로). */
export type EventViewer = 'guest' | 'member'

/** viewer가 볼 수 있는 audience 값 집합 — member=[ALL,MEMBER] / guest=[ALL,GUEST] */
function audienceFilterFor(viewer: EventViewer): Array<'ALL' | 'GUEST' | 'MEMBER'> {
  return viewer === 'member' ? ['ALL', 'MEMBER'] : ['ALL', 'GUEST']
}

/**
 * 지정 채널에 지금 노출할 Event 1개를 반환한다.
 *  조건: isActive && tier=PRIMARY && show{채널}=true && startAt <= now < endAt
 *   (+ viewer 지정 시 audience ∈ [ALL, viewer전용] — 회원/비회원 분리 노출)
 *  여러 개면 startAt 최신 1개(슬롯당 1개 보장 — 저장 시 충돌 가드가 중복을 애초에 막는다).
 *  없으면 null (fallback 없음 — 호출부 책임).
 */
export async function getExposedEvent(
  channel: EventChannel,
  now: Date = new Date(),
  viewer?: EventViewer,
): Promise<Event | null> {
  const channelFilter =
    channel === 'bottomPopup' ? { showBottomPopup: true } : { showHero: true }
  const audienceFilter = viewer ? { audience: { in: audienceFilterFor(viewer) } } : {}

  return prisma.event.findFirst({
    where: {
      isActive: true,
      tier: 'PRIMARY',
      ...channelFilter,
      ...audienceFilter,
      startAt: { lte: now },
      endAt: { gt: now },
    },
    orderBy: { startAt: 'desc' },
  })
}

/** id로 Event 단건 조회 (없으면 null). /events/[id] canonical 해석용(Phase 2+). */
export async function getEventById(id: string): Promise<Event | null> {
  return prisma.event.findUnique({ where: { id } })
}

export interface ExposedFeedback {
  eventId: string
  title: string
  description: string | null
}

/**
 * 채널(팝업/HERO)에 지금 노출할 **FEEDBACK(의견수렴형) 이벤트**를 반환한다. 없으면 null. (Phase 3b)
 * ⚠️ `getExposedEvent`(PRIMARY·show{채널}·window 1개)를 그대로 쓰되 **type=FEEDBACK일 때만** 반환.
 *    - getExposedEvent가 1개만 반환 → VOTE(resolveChannelVote)와 **자연 배타**(같은 채널 동시 2개 불가).
 *    - 노출 대상이 VOTE거나 없으면 null → FEEDBACK 팝업/HERO 미노출(VOTE 우선).
 */
export async function getExposedFeedback(
  channel: EventChannel,
  now: Date = new Date(),
): Promise<ExposedFeedback | null> {
  const ev = await getExposedEvent(channel, now)
  if (!ev || ev.type !== 'FEEDBACK') return null
  return { eventId: ev.id, title: ev.title, description: ev.description }
}

export interface ExposedSurvey {
  eventId: string
  title: string
  description: string | null
}

/**
 * 채널(팝업/HERO)에 지금 **viewer(회원/비회원)** 에게 노출할 **1분 의견함(SURVEY)** 을 반환한다. 없으면 null. (Phase 5 + audience)
 * getExposedEvent(PRIMARY·show{채널}·window·audience 1개)를 그대로 쓰되 **type=SURVEY일 때만** 반환.
 *  - viewer 필수: audience ∈ [ALL, viewer전용] 필터 → 비회원은 GUEST/ALL 설문만, 회원은 MEMBER/ALL 설문만.
 *  - VOTE/FEEDBACK/없음이면 null → SURVEY 팝업/HERO 미노출(채널·viewer당 1개 배타).
 */
export async function getExposedSurvey(
  channel: EventChannel,
  viewer: EventViewer,
  now: Date = new Date(),
): Promise<ExposedSurvey | null> {
  const ev = await getExposedEvent(channel, now, viewer)
  if (!ev || ev.type !== 'SURVEY') return null
  return { eventId: ev.id, title: ev.title, description: ev.description }
}

/**
 * 채널(팝업/HERO)에 지금 노출할 **투표(VoteEvent) id**를 선택한다. 노출 안 하면 null.
 * ⚠️ selection 전용 — `getTodayPublic()`/`revalidatePath`를 호출하지 않는다(서버 렌더에서 안전).
 *    실제 vote payload/teaser는 호출부가 각자 조회한다(팝업=getTodayPublic 경로, HERO=직접 쿼리).
 *
 * 정책 (Phase 2):
 *  1) getExposedEvent(channel) 가 Event를 반환:
 *     - type !== 'VOTE' (FEEDBACK/NOTICE) → null (Phase 2는 VOTE만 렌더, 나머지 차단)
 *     - VOTE → 그 voteEventId (노출 window 중엔 항상 오늘 투표)
 *  2) getExposedEvent 가 null (해당 채널에 노출할 Event 없음):
 *     - 오늘 투표에 Event wrapper가 **있으면** → null
 *       (Event가 채널을 OFF/비-PRIMARY/window 밖으로 통제 중 → 노출 안 함)
 *     - 오늘 투표에 wrapper가 **없으면** → 오늘 투표 id 반환 (Event 없는 날만 기존 동작 fallback)
 *     - 오늘 투표 자체가 없으면 → null
 */
export async function resolveChannelVote(channel: EventChannel): Promise<string | null> {
  const ev = await getExposedEvent(channel)
  if (ev) {
    if (ev.type !== 'VOTE' || !ev.voteEventId) return null // FEEDBACK/NOTICE 차단
    return ev.voteEventId
  }
  // 해당 채널에 노출할 Event 없음 → fallback 판정
  const todayVote = await prisma.voteEvent.findUnique({
    where: { date: getKstToday() },
    select: { id: true },
  })
  if (!todayVote) return null
  const wrapper = await prisma.event.findUnique({
    where: { voteEventId: todayVote.id },
    select: { id: true },
  })
  if (wrapper) return null // Event가 통제 중(채널 OFF/비-PRIMARY/window 밖) → 노출 안 함
  return todayVote.id // Event 없는 날만 기존 오늘 투표로 fallback
}
