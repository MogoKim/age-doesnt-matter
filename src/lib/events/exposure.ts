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

/**
 * 지정 채널에 지금 노출할 Event 1개를 반환한다.
 *  조건: isActive && tier=PRIMARY && show{채널}=true && startAt <= now < endAt
 *  여러 개면 startAt 최신 1개(슬롯당 1개 보장 — 저장 시 충돌 가드가 중복을 애초에 막는다).
 *  없으면 null (fallback 없음 — 호출부 책임).
 */
export async function getExposedEvent(
  channel: EventChannel,
  now: Date = new Date(),
): Promise<Event | null> {
  const channelFilter =
    channel === 'bottomPopup' ? { showBottomPopup: true } : { showHero: true }

  return prisma.event.findFirst({
    where: {
      isActive: true,
      tier: 'PRIMARY',
      ...channelFilter,
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
