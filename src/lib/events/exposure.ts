import { prisma } from '@/lib/prisma'
import type { Event } from '@/generated/prisma/client'

/**
 * Event 오케스트레이션 계층 — 노출 resolver (Phase 1 기반)
 *
 * ⚠️ 이 resolver는 **fallback을 하지 않는다.**
 *  - Event 테이블만 조회한다.
 *  - 조건에 맞는 Event가 없으면 **null**을 반환한다.
 *  - "오늘 투표(VoteEvent) fallback"은 여기서 처리하지 않는다 — 팝업/HERO 호출부(Phase 2)가
 *    `getExposedEvent(...) === null` 일 때 기존 `/api/votes/today` 로직으로 대체한다.
 *
 * Phase 1은 이 resolver를 "추가만" 한다(호출부 없음) → 기존 팝업/HERO 동작 회귀 0.
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
