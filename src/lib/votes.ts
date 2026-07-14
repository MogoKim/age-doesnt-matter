import { cookies, headers } from 'next/headers'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { effectiveVoteStatus, voteCloseAtMs } from '@/lib/vote-status'
import type { VoteChoice, VoteEvent } from '@/generated/prisma/client'

const VOTE_COOKIE = 'guest_vote_id'

/** KST(UTC+9) 기준 "오늘" → UTC 자정 Date (@db.Date 컬럼용). UTC 날짜 밀림 방지 — 모든 생성/조회는 이 함수 경유. */
export function getKstToday(): Date {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()))
}

export interface VoteIdentity {
  cookieId: string
  ipHash: string
}

/** guest-likes.ts 패턴 복제 — 투표 전용 쿠키(1년) + IP 해시. Route Handler/Server Action에서만 호출(쿠키 set). */
export async function getVoteIdentity(): Promise<VoteIdentity> {
  const cookieStore = await cookies()
  let cookieId = cookieStore.get(VOTE_COOKIE)?.value
  if (!cookieId) {
    cookieId = randomUUID()
    cookieStore.set(VOTE_COOKIE, cookieId, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  }

  const headerStore = await headers()
  const ip =
    headerStore.get('x-forwarded-for')?.split(',')[0].trim() ??
    headerStore.get('x-real-ip') ??
    '0.0.0.0'
  const salt = process.env.GUEST_VOTE_SALT ?? process.env.GUEST_LIKE_SALT ?? 'unaeo-guest-vote-salt'
  const ipHash = createHash('sha256').update(`${ip}:${salt}`).digest('hex')

  return { cookieId, ipHash }
}

export interface VoteStatusPayload {
  id: string
  question: string
  optionA: string
  optionB: string
  status: 'OPEN' | 'CLOSED'
  linkedPostId: string | null
  linkedPostUrl: string | null
  /** 표시 표수 = seedCount + USER/GUEST 실 표 (BOT 제외) */
  displayA: number
  displayB: number
  total: number
  displayViews: number
  myChoice: 'A' | 'B' | null
}

/** USER/GUEST 표만 집계 (BOT ballot은 배지 전용 — 집계 절대 제외) */
async function countRealBallots(voteEventId: string): Promise<{ a: number; b: number }> {
  const grouped = await prisma.voteBallot.groupBy({
    by: ['choice'],
    where: { voteEventId, voterType: { in: ['USER', 'GUEST'] } },
    _count: { _all: true },
  })
  const a = grouped.find((g) => g.choice === 'A')?._count._all ?? 0
  const b = grouped.find((g) => g.choice === 'B')?._count._all ?? 0
  return { a, b }
}

async function findMyBallot(
  voteEventId: string,
  userId: string | null,
  identity: VoteIdentity,
): Promise<{ id: string; choice: VoteChoice } | null> {
  return prisma.voteBallot.findFirst({
    // 비회원 '내 표' 판정은 cookieId만 — ipHash 매칭 시 같은 IP(가족·시크릿·다른 브라우저)가 오탐됨.
    // ipHash는 저장만 하고(어뷰징 분석용) 중복 차단 기준으로 쓰지 않는다 (DB unique도 제거됨, 2026-07-13).
    where: userId
      ? { voteEventId, userId }
      : { voteEventId, voterType: 'GUEST', cookieId: identity.cookieId },
    select: { id: true, choice: true },
  })
}

/** 연동 게시글 URL 계산 — boardType 역매핑 + slug 우선 (HERO teaser 슬라이드에서도 사용) */
export async function resolveLinkedPostUrl(linkedPostId: string | null): Promise<string | null> {
  if (!linkedPostId) return null
  const post = await prisma.post.findUnique({
    where: { id: linkedPostId },
    select: { slug: true, boardType: true, status: true },
  })
  if (!post || post.status !== 'PUBLISHED') return null
  const boardSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? post.boardType.toLowerCase()
  return `/community/${boardSlug}/${post.slug ?? linkedPostId}`
}

/**
 * 오늘(KST)의 투표 — 팝업/HERO 입구용 **public** payload (사용자 무관, 캐시 가능).
 * myChoice는 항상 null(사용자별 값은 getTodayMyChoice로 분리) → CDN s-maxage 캐시 안전.
 * 실 표 집계(groupBy) 생략 — displayA/B는 seed만(팝업/HERO 미사용). 게시글 결과는 getVoteStatusById.
 * closeAtMs: 라우트의 20:00 경계 동적 캐시(s-maxage) 계산용.
 */
export async function getTodayPublic(): Promise<{ vote: VoteStatusPayload; closeAtMs: number } | null> {
  const event = await prisma.voteEvent.findUnique({ where: { date: getKstToday() } })
  if (!event) return null
  const linkedPostUrl = await resolveLinkedPostUrl(event.linkedPostId)
  const vote = toPayload(event, { a: 0, b: 0 }, null, linkedPostUrl)
  return { vote, closeAtMs: voteCloseAtMs(event.date) }
}

/**
 * 오늘(KST) 투표의 **내 선택**만 — 사용자별(쿠키/회원). 절대 캐시 금지(no-store).
 * 팝업 노출 판정(myChoice null 여부)용 경량 조회.
 */
export async function getTodayMyChoice(
  userId: string | null,
  identity: VoteIdentity,
): Promise<'A' | 'B' | null> {
  const event = await prisma.voteEvent.findUnique({ where: { date: getKstToday() }, select: { id: true } })
  if (!event) return null
  const mine = await findMyBallot(event.id, userId, identity)
  return mine?.choice ?? null
}

/** 특정 투표 ID 현황 — 지난 투표가 연동된 게시글에서도 결과 열람 가능 */
export async function getVoteStatusById(
  voteEventId: string,
  userId: string | null,
  identity: VoteIdentity,
): Promise<VoteStatusPayload | null> {
  const event = await prisma.voteEvent.findUnique({ where: { id: voteEventId } })
  if (!event) return null
  return buildStatusPayload(event, userId, identity)
}

async function buildStatusPayload(
  event: VoteEvent,
  userId: string | null,
  identity: VoteIdentity,
): Promise<VoteStatusPayload> {
  const [real, mine, linkedPostUrl] = await Promise.all([
    countRealBallots(event.id),
    findMyBallot(event.id, userId, identity),
    resolveLinkedPostUrl(event.linkedPostId),
  ])
  return toPayload(event, real, mine?.choice ?? null, linkedPostUrl)
}

function toPayload(
  event: VoteEvent,
  real: { a: number; b: number },
  myChoice: VoteChoice | null,
  linkedPostUrl: string | null,
): VoteStatusPayload {
  const displayA = event.seedCountA + real.a
  const displayB = event.seedCountB + real.b
  return {
    id: event.id,
    question: event.question,
    optionA: event.optionA,
    optionB: event.optionB,
    // raw DB status가 아니라 시간 규칙 적용값 — KST 20:00 이후는 무조건 CLOSED
    status: effectiveVoteStatus(event.status, event.date),
    linkedPostId: event.linkedPostId,
    linkedPostUrl,
    displayA,
    displayB,
    total: displayA + displayB,
    displayViews: event.displayViews,
    myChoice,
  }
}

export type CastResult =
  | { ok: true; payload: VoteStatusPayload }
  | { ok: false; error: string }

/** 투표/변경 — OPEN에서만. 회원=userId, 비회원=cookieId+ipHash. 같은 선택 재클릭은 no-op. */
export async function castVote(
  voteEventId: string,
  choice: VoteChoice,
  userId: string | null,
  identity: VoteIdentity,
): Promise<CastResult> {
  const event = await prisma.voteEvent.findUnique({ where: { id: voteEventId } })
  if (!event) return { ok: false, error: '투표를 찾을 수 없습니다' }
  // 시간 규칙 포함 마감 판정 — KST 20:00 이후 투표/선택 변경 거부 (payload status와 동일 기준)
  if (effectiveVoteStatus(event.status, event.date) !== 'OPEN') {
    return { ok: false, error: '마감된 투표입니다' }
  }

  const existing = await findMyBallot(voteEventId, userId, identity)

  try {
    if (existing) {
      if (existing.choice !== choice) {
        await prisma.voteBallot.update({ where: { id: existing.id }, data: { choice } })
      }
    } else {
      await prisma.voteBallot.create({
        data: {
          voteEventId,
          voterType: userId ? 'USER' : 'GUEST',
          userId,
          ipHash: identity.ipHash,
          cookieId: identity.cookieId,
          choice,
        },
      })
      // 실측 로깅 — 봇 아님 (BOT ballot은 이 경로를 타지 않음)
      void prisma.eventLog
        .create({
          data: {
            eventName: 'vote_cast',
            userId,
            properties: { voteEventId, choice, voterType: userId ? 'USER' : 'GUEST' },
            isBot: false,
          },
        })
        .catch(() => {})
    }
  } catch (e: unknown) {
    // unique 충돌(동시 요청 등) = 이미 투표됨
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return { ok: false, error: '이미 투표하셨어요' }
    }
    throw e
  }

  const [real, fresh, linkedPostUrl] = await Promise.all([
    countRealBallots(voteEventId),
    prisma.voteEvent.findUnique({ where: { id: voteEventId } }),
    resolveLinkedPostUrl(event.linkedPostId),
  ])
  return { ok: true, payload: toPayload(fresh ?? event, real, choice, linkedPostUrl) }
}

/** 게시글 댓글 진영 배지용 — linkedPostId가 이 글인 최신 투표의 userId→choice 맵 (USER + BOT 포함, 배지 전용) */
export async function getVoteBadgesForPost(postId: string): Promise<{
  optionA: string
  optionB: string
  byUserId: Record<string, 'A' | 'B'>
} | null> {
  const event = await prisma.voteEvent.findFirst({
    where: { linkedPostId: postId },
    orderBy: { date: 'desc' },
    select: { id: true, optionA: true, optionB: true },
  })
  if (!event) return null

  const ballots = await prisma.voteBallot.findMany({
    where: { voteEventId: event.id, userId: { not: null } },
    select: { userId: true, choice: true },
  })

  const byUserId: Record<string, 'A' | 'B'> = {}
  for (const b of ballots) {
    if (b.userId) byUserId[b.userId] = b.choice
  }
  return { optionA: event.optionA, optionB: event.optionB, byUserId }
}
