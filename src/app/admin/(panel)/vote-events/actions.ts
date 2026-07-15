'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { getKstToday } from '@/lib/votes'
import { voteOpenAtMs, voteVisibleStatus } from '@/lib/vote-status'
import { generateVoteDraftBatch, generateVotePostDraft, type VoteDraftRow } from '@/lib/ai/vote-draft'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { EVENT_CATEGORY } from '@/lib/event-category'
import type { VoteChoice, VoteEventStatus } from '@/generated/prisma/client'

interface ActionResult {
  error?: string
  ok?: boolean
}

async function requireAdmin(): Promise<ActionResult | null> {
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다' }
  return null
}

/** 연동 게시글 경로 revalidate (있으면) */
async function revalidateLinkedPost(linkedPostId: string | null) {
  revalidatePath('/')
  if (!linkedPostId) return
  const post = await prisma.post.findUnique({
    where: { id: linkedPostId },
    select: { slug: true, boardType: true },
  })
  if (!post) return
  const boardSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? post.boardType.toLowerCase()
  revalidatePath(`/community/${boardSlug}/${post.slug ?? linkedPostId}`)
}

/** 공식 이벤트 계정 식별자 (런타임 조회 — 하드코딩 id 금지) */
const OFFICIAL_VOTE_AUTHOR_NICKNAME = '우리 나이가 어때서'
const OFFICIAL_VOTE_AUTHOR_EMAIL = 'official@unao.bot'

/**
 * 투표 자동 생성 게시글 작성자 = 공식 계정 "우리 나이가 어때서"로 고정.
 * ① 닉네임이 공식명인 ACTIVE 계정 → ② 운영용 official@unao.bot 계정 → ③ 없으면 null(에러로 막음).
 * ⚠️ 개인 페르소나(하늘바라기 등) 재사용/폴백 금지 — 없으면 게시글 생성을 막는다(과거 게시글 소급 변경 없음).
 */
async function resolveVotePostAuthorId(): Promise<string | null> {
  const byNickname = await prisma.user.findFirst({
    where: { nickname: OFFICIAL_VOTE_AUTHOR_NICKNAME, status: 'ACTIVE' },
    select: { id: true },
  })
  if (byNickname) return byNickname.id

  const byEmail = await prisma.user.findFirst({
    where: { email: OFFICIAL_VOTE_AUTHOR_EMAIL, status: 'ACTIVE' },
    select: { id: true },
  })
  if (byEmail) return byEmail.id

  return null
}

/** 투표 유도 짧은 본문 — 옵션 기반, 질문 중복 없이(제목=질문) 투표+댓글만 유도 */
function buildVotePostContent(optionA: string, optionB: string): string {
  return [
    `<p>${optionA} 쪽인 분도 있고, ${optionB} 쪽인 분도 있어요.</p>`,
    `<p>어느 쪽에 더 가까우신가요? 한 표 남기고, 왜 그런지도 댓글로 나눠주세요.</p>`,
  ].join('\n')
}

/**
 * 투표용 게시글 자동 생성 (STORY·ADMIN). 제목=질문, slug=null(id 접근).
 * 09:00 오픈 전(예약 미래 날짜)이면 **DRAFT** — 목록/상세 status 필터에서 자동 제외(09:00 전 노출 차단).
 * 09:00 이후 오픈 시점에 getTodayPublic이 DRAFT→PUBLISHED로 lazy 전환(크론 없음).
 */
async function createVotePost(
  question: string,
  optionA: string,
  optionB: string,
  eventDate: Date,
  content?: string, // AI 초안/직접 입력 본문 — 비우면 템플릿 기본문
): Promise<{ id: string } | { error: string }> {
  const authorId = await resolveVotePostAuthorId()
  if (!authorId) return { error: '공식 이벤트 계정("우리 나이가 어때서")을 찾을 수 없습니다. 공식 계정을 먼저 생성해 주세요.' }
  const opensInFuture = Date.now() < voteOpenAtMs(eventDate)
  const body = content?.trim() ? content.trim() : buildVotePostContent(optionA, optionB)
  const post = await prisma.post.create({
    data: {
      boardType: 'STORY',
      status: opensInFuture ? 'DRAFT' : 'PUBLISHED',
      source: 'ADMIN',
      category: EVENT_CATEGORY, // 이벤트 연동글 — 사는이야기 목록/홈/검색/sitemap 제외 + 상세는 /events로 리다이렉트
      title: question,
      content: body,
      authorId,
      publishedAt: new Date(voteOpenAtMs(eventDate)), // 09:00 오픈 시각
    },
    select: { id: true },
  })
  return { id: post.id }
}

/** 'YYYY-MM-DD'(KST) → getKstToday와 동일 형식(그날 자정 UTC). 없거나 형식 오류면 오늘. */
function resolveEventDate(dateStr?: string): Date {
  if (!dateStr) return getKstToday()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return getKstToday()
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/** Prisma 에러가 "Event 테이블 미존재"인지 판정 — 마이그레이션 HANDOFF 전 전환 안전장치용 */
function isMissingEventTable(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  if (code === 'P2021' || code === 'P2022') return true // table/column does not exist
  const msg = (e as { message?: string })?.message ?? ''
  return /does not exist|undefined table|no such table/i.test(msg)
}

/**
 * 투표(VOTE) 생성/수정 시 노출 계층 Event를 동반 생성/갱신 (Phase 1 기반, 투표 로직 무접촉).
 *  - Event = 노출 계층: type=VOTE, voteEventId 1:1, tier=PRIMARY, 팝업+HERO on.
 *  - ⭐ Phase 2(D1) 노출창: startAt=그날 09:00 KST ~ endAt=**그날 24:00 KST(당일 끝)**.
 *    · endAt = 채널 **노출 종료** (HERO는 20:00 이후에도 '결과 보러 가기' 티저 유지 → 자정까지 노출).
 *    · 투표 가능/마감(09:00 open·20:00 close)은 **VoteEvent status + effectiveVoteStatus**가 담당(분리).
 *  - PRIMARY 충돌 가드: 같은 채널(팝업/HERO)·시간 겹침·isActive·tier=PRIMARY인 **다른** Event가 있으면 저장 차단.
 *  - createdByAdminId = getAdminSession().adminId.
 *  - ⚠️ Event 테이블 미적용(마이그레이션 HANDOFF 전) 구간은 P2021로 실패 → **투표 생성 회귀 0**을 위해
 *    조용히 스킵(가드/동반생성 미동작). 테이블 적용 후부터 정상 작동. (우회가 아니라 전환 안전장치)
 * @returns 충돌 차단 시 { error }, 그 외 null
 */
async function syncVoteExposureEvent(params: {
  voteEventId: string
  eventDate: Date
  title: string
}): Promise<{ error: string } | null> {
  const startAt = new Date(voteOpenAtMs(params.eventDate)) // 그날 09:00 KST (채널 노출 시작)
  // 그날 24:00 KST(당일 끝 = 다음날 자정) — eventDate는 KST 09:00 instant(= date+0h), +15h = KST 24:00
  const endAt = new Date(params.eventDate.getTime() + 15 * 60 * 60 * 1000)
  const session = await getAdminSession()
  const adminId = session?.adminId
  if (!adminId) return null // requireAdmin 통과 후이므로 사실상 도달 안 함 — 방어적으로 스킵

  try {
    // PRIMARY 충돌 가드 — 같은 채널(팝업/HERO)·시간 겹침·자기 자신(VOTE 재-upsert) 제외
    const conflict = await prisma.event.findFirst({
      where: {
        isActive: true,
        tier: 'PRIMARY',
        voteEventId: { not: params.voteEventId },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        OR: [{ showBottomPopup: true }, { showHero: true }], // VOTE는 팝업+HERO 둘 다 사용
      },
      select: { id: true, title: true },
    })
    if (conflict) {
      return {
        error: `이 시간대의 팝업/HERO를 이미 다른 이벤트가 사용 중입니다: "${conflict.title}". 기존 이벤트를 내리거나 시간을 조정한 뒤 다시 시도해 주세요.`,
      }
    }

    // 동반 생성/갱신 (voteEventId @unique로 1:1 upsert)
    await prisma.event.upsert({
      where: { voteEventId: params.voteEventId },
      create: {
        type: 'VOTE',
        title: params.title,
        voteEventId: params.voteEventId,
        startAt,
        endAt,
        showBottomPopup: true,
        showHero: true,
        tier: 'PRIMARY',
        createdByAdminId: adminId,
      },
      update: { title: params.title, startAt, endAt },
    })
    return null
  } catch (e) {
    if (isMissingEventTable(e)) {
      console.warn(
        '[vote-events] Event 테이블 미적용 — 노출 Event 동반 생성 스킵(마이그레이션 HANDOFF 후 정상화):',
        (e as Error)?.message,
      )
      return null
    }
    throw e
  }
}

/**
 * 투표 생성/수정 — date 미지정 시 오늘(KST), 지정 시 예약(미래 날짜 가능).
 * 같은 날짜 중복은 VoteEvent.date @unique + upsert로 방지(자동).
 * linkedPostId 비어 있으면 연동 게시글 자동 생성 후 연결. 직접 입력 시(고급)엔 기존 존재 검증.
 */
export async function upsertTodayVoteEvent(input: {
  question: string
  optionA: string
  optionB: string
  linkedPostId: string | null
  date?: string // 'YYYY-MM-DD' (KST). 없으면 오늘 — 예약 시 미래 날짜 지정
  content?: string // 자동 생성 게시글 본문(AI 초안/직접 입력). 비우면 템플릿 기본문
}): Promise<ActionResult & { linkedPostId?: string; autoCreated?: boolean }> {
  const denied = await requireAdmin()
  if (denied) return denied

  const question = input.question.trim()
  const optionA = input.optionA.trim()
  const optionB = input.optionB.trim()
  if (!question || !optionA || !optionB) return { error: '질문과 선택지 A/B를 모두 입력해 주세요' }

  const eventDate = resolveEventDate(input.date)

  let linkedPostId = input.linkedPostId?.trim() || null
  let autoCreated = false

  if (linkedPostId) {
    // 고급: 직접 입력한 id는 기존 검증 유지
    const post = await prisma.post.findUnique({ where: { id: linkedPostId }, select: { id: true } })
    if (!post) return { error: `연동 게시글을 찾을 수 없습니다: ${linkedPostId}` }
  } else {
    // 자동: 해당 날짜 투표에 이미 게시글 연결돼 있으면 유지, 없으면 새로 생성
    const existing = await prisma.voteEvent.findUnique({
      where: { date: eventDate },
      select: { linkedPostId: true },
    })
    if (existing?.linkedPostId) {
      linkedPostId = existing.linkedPostId
    } else {
      const created = await createVotePost(question, optionA, optionB, eventDate, input.content)
      if ('error' in created) return { error: created.error }
      linkedPostId = created.id
      autoCreated = true
    }
  }

  const voteEvent = await prisma.voteEvent.upsert({
    where: { date: eventDate },
    create: { date: eventDate, question, optionA, optionB, linkedPostId },
    update: { question, optionA, optionB, linkedPostId },
    select: { id: true },
  })

  // 노출 계층 Event(VOTE) 동반 생성/갱신 + PRIMARY 충돌 가드 (Phase 1 기반, 투표 upsert 뒤 append)
  const exposure = await syncVoteExposureEvent({ voteEventId: voteEvent.id, eventDate, title: question })
  if (exposure?.error) return { error: exposure.error }

  await revalidateLinkedPost(linkedPostId) // '/' + 게시글 상세
  revalidatePath('/admin/vote-events')
  revalidatePath('/community/stories')
  return { ok: true, linkedPostId, autoCreated }
}

/** seed 표수·표시 조회수 조정 (판깔기 — 실측과 분리) */
export async function updateVoteDisplayNumbers(input: {
  voteEventId: string
  seedCountA: number
  seedCountB: number
  displayViews: number
}): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const clamp = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0))
  await prisma.voteEvent.update({
    where: { id: input.voteEventId },
    data: {
      seedCountA: clamp(input.seedCountA),
      seedCountB: clamp(input.seedCountB),
      displayViews: clamp(input.displayViews),
    },
  })
  revalidatePath('/admin/vote-events')
  return { ok: true }
}

/** OPEN/CLOSED 전환 */
export async function setVoteStatus(voteEventId: string, status: VoteEventStatus): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const event = await prisma.voteEvent.update({ where: { id: voteEventId }, data: { status } })
  await revalidateLinkedPost(event.linkedPostId)
  revalidatePath('/admin/vote-events')
  return { ok: true }
}

/**
 * 예약 투표 삭제 — 09:00 오픈 전(HIDDEN) 예약만. 서버에서 조건 전면 재검증(클라 버튼 숨김과 무관).
 * 거부: OPEN/CLOSED·오늘/지난 투표 / 실 표(USER·GUEST) 1개↑ / 연동 게시글 PUBLISHED.
 * 삭제: VoteEvent(→ ballots cascade) + 연동 게시글이 DRAFT면 함께(트랜잭션 원자 처리).
 */
export async function deleteReservedVoteEvent(voteEventId: string): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const event = await prisma.voteEvent.findUnique({
    where: { id: voteEventId },
    select: { id: true, date: true, status: true, linkedPostId: true },
  })
  if (!event) return { error: '삭제할 예약 투표를 찾을 수 없습니다' }

  // 조건 1·2·5: 09:00 오픈 전 예약(HIDDEN)만 — 진행 중/종료/오늘/지난 투표 거부
  if (voteVisibleStatus(event.status, event.date) !== 'HIDDEN') {
    return { error: '진행 중이거나 종료된 투표는 삭제할 수 없습니다 (09:00 오픈 전 예약만 삭제 가능).' }
  }
  if (Date.now() >= voteOpenAtMs(event.date)) {
    return { error: '이미 오픈 시각(09:00)이 지나 삭제할 수 없습니다.' }
  }

  // 조건 3: 실 표(USER/GUEST) 0 — 봇 배지 ballot은 cascade로 함께 삭제되므로 집계 제외
  const realVotes = await prisma.voteBallot.count({
    where: { voteEventId: event.id, voterType: { in: ['USER', 'GUEST'] } },
  })
  if (realVotes > 0) return { error: `실 표가 ${realVotes}개 있어 삭제할 수 없습니다.` }

  // 조건 4: 연동 게시글 — 없거나 '비공개(DRAFT·HIDDEN)'만 함께 삭제. 공개(PUBLISHED·SEO_ONLY)면 거부.
  // 예약글은 DRAFT로 생성되나 audit-and-hide 등으로 HIDDEN이 될 수 있어 DRAFT 단독 조건은 과협소(삭제 불가 버그).
  // HIDDEN도 비공개이므로 예약 삭제 시 함께 제거 가능. 공개/색인(PUBLISHED·SEO_ONLY)만 하드 거부.
  let postIdToDelete: string | null = null
  let linkedPathToRevalidate: string | null = null
  if (event.linkedPostId) {
    const post = await prisma.post.findUnique({
      where: { id: event.linkedPostId },
      select: { id: true, status: true, slug: true, boardType: true },
    })
    if (post) {
      if (post.status === 'PUBLISHED' || post.status === 'SEO_ONLY') {
        return { error: '연동 게시글이 공개(PUBLISHED) 상태라 삭제할 수 없습니다.' }
      }
      postIdToDelete = post.id
      const boardSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? post.boardType.toLowerCase()
      linkedPathToRevalidate = `/community/${boardSlug}/${post.slug ?? post.id}`
    }
  }

  // 삭제 — VoteEvent(→ ballots cascade) + 비공개 연동 게시글을 트랜잭션으로 원자 처리
  // (게시글 삭제가 FK 등으로 실패하면 전체 롤백 → VoteEvent 고아 방지)
  await prisma.$transaction(async (tx) => {
    await tx.voteEvent.delete({ where: { id: event.id } })
    if (postIdToDelete) {
      await tx.post.delete({ where: { id: postIdToDelete } })
    }
  })

  revalidatePath('/admin/vote-events')
  revalidatePath('/')
  revalidatePath('/community/stories')
  if (linkedPathToRevalidate) revalidatePath(linkedPathToRevalidate)

  return { ok: true }
}

/** AI 초안 일괄 생성 — 버튼 클릭 1회 = API 호출 1회 (light-only). 실패해도 직접 입력 등록은 무관하게 동작 */
export async function requestVoteDrafts(input: {
  voteEventId: string
  rows: VoteDraftRow[]
}): Promise<{ drafts?: string[]; error?: string }> {
  const denied = await requireAdmin()
  if (denied) return { error: denied.error }

  const event = await prisma.voteEvent.findUnique({ where: { id: input.voteEventId } })
  if (!event) return { error: '투표를 찾을 수 없습니다' }

  const result = await generateVoteDraftBatch({
    question: event.question,
    optionA: event.optionA,
    optionB: event.optionB,
    rows: input.rows,
  })
  if (!result.ok) return { error: result.error }
  return { drafts: result.drafts }
}

/**
 * 게시글 **본문** AI 초안 — 버튼 클릭 1회 = API 호출 1회 (light-only).
 * 실패해도 투표/게시글 생성은 무관 — 호출부가 템플릿 기본문을 유지한다.
 */
export async function requestVotePostDraft(input: {
  question: string
  optionA: string
  optionB: string
}): Promise<{ body?: string; error?: string }> {
  const denied = await requireAdmin()
  if (denied) return { error: denied.error }

  const question = input.question.trim()
  const optionA = input.optionA.trim()
  const optionB = input.optionB.trim()
  if (!question || !optionA || !optionB) return { error: '질문과 선택지 A/B를 먼저 입력해 주세요' }

  const result = await generateVotePostDraft({ question, optionA, optionB })
  if (!result.ok) return { error: result.error }
  return { body: result.body }
}

export interface BotCommentRow {
  botUserId: string
  camp: VoteChoice
  content: string
}

/** 봇 댓글 일괄 등록 — linkedPostId 게시글에 봇 authorId로 생성 + 배지용 BOT ballot upsert (집계 제외) */
export async function registerBotComments(input: {
  voteEventId: string
  rows: BotCommentRow[]
}): Promise<ActionResult & { registered?: number }> {
  const denied = await requireAdmin()
  if (denied) return denied

  const rows = input.rows
    .map((r) => ({ ...r, content: r.content.trim() }))
    .filter((r) => r.content.length > 0)
  if (rows.length === 0) return { error: '내용이 있는 row가 없습니다' }
  if (rows.length > 5) return { error: '한 번에 최대 5개까지 등록 가능합니다' }

  const event = await prisma.voteEvent.findUnique({ where: { id: input.voteEventId } })
  if (!event) return { error: '투표를 찾을 수 없습니다' }
  if (!event.linkedPostId) return { error: '연동 게시글(linkedPostId)을 먼저 설정해 주세요' }
  const postId = event.linkedPostId

  // 봇 계정 검증 (@unao.bot 페르소나만 허용 — 공식 이벤트 계정은 봇 댓글 author로 금지)
  const botIds = rows.map((r) => r.botUserId)
  const bots = await prisma.user.findMany({
    where: {
      id: { in: botIds },
      email: { endsWith: '@unao.bot' },
      nickname: { not: OFFICIAL_VOTE_AUTHOR_NICKNAME },
      NOT: { email: OFFICIAL_VOTE_AUTHOR_EMAIL },
    },
    select: { id: true },
  })
  const validBotIds = new Set(bots.map((b) => b.id))
  if (rows.some((r) => !validBotIds.has(r.botUserId))) {
    return { error: '봇 계정이 아닌 사용자(또는 공식 이벤트 계정)가 포함되어 있습니다' }
  }

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.comment.create({
        data: { postId, authorId: row.botUserId, content: row.content },
      })
      // 진영 배지 표시 전용 BOT ballot — 표시/실측 표수 어디에도 집계되지 않음 (voterType 필터)
      await tx.voteBallot.upsert({
        where: { voteEventId_userId: { voteEventId: event.id, userId: row.botUserId } },
        create: {
          voteEventId: event.id,
          voterType: 'BOT',
          userId: row.botUserId,
          ipHash: `bot:${row.botUserId}`,
          cookieId: `bot:${row.botUserId}`,
          choice: row.camp,
        },
        update: { choice: row.camp },
      })
    }
    await tx.post.update({
      where: { id: postId },
      data: { commentCount: { increment: rows.length }, lastEngagedAt: new Date() },
    })
  })

  await revalidateLinkedPost(postId)
  revalidatePath('/admin/vote-events')
  return { ok: true, registered: rows.length }
}
