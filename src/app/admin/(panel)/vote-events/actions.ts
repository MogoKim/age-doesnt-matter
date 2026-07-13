'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { getKstToday } from '@/lib/votes'
import { generateVoteDraftBatch, type VoteDraftRow } from '@/lib/ai/vote-draft'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
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

/** 오늘 투표 생성/수정 (date는 KST 오늘 고정 — 하루 1투표 MVP) */
export async function upsertTodayVoteEvent(input: {
  question: string
  optionA: string
  optionB: string
  linkedPostId: string | null
}): Promise<ActionResult> {
  const denied = await requireAdmin()
  if (denied) return denied

  const question = input.question.trim()
  const optionA = input.optionA.trim()
  const optionB = input.optionB.trim()
  if (!question || !optionA || !optionB) return { error: '질문과 선택지 A/B를 모두 입력해 주세요' }

  const linkedPostId = input.linkedPostId?.trim() || null
  if (linkedPostId) {
    const post = await prisma.post.findUnique({ where: { id: linkedPostId }, select: { id: true } })
    if (!post) return { error: `연동 게시글을 찾을 수 없습니다: ${linkedPostId}` }
  }

  await prisma.voteEvent.upsert({
    where: { date: getKstToday() },
    create: { date: getKstToday(), question, optionA, optionB, linkedPostId },
    update: { question, optionA, optionB, linkedPostId },
  })

  await revalidateLinkedPost(linkedPostId)
  revalidatePath('/admin/vote-events')
  return { ok: true }
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

  // 봇 계정 검증 (@unao.bot만 허용)
  const botIds = rows.map((r) => r.botUserId)
  const bots = await prisma.user.findMany({
    where: { id: { in: botIds }, email: { endsWith: '@unao.bot' } },
    select: { id: true },
  })
  const validBotIds = new Set(bots.map((b) => b.id))
  if (rows.some((r) => !validBotIds.has(r.botUserId))) {
    return { error: '봇 계정이 아닌 사용자가 포함되어 있습니다' }
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
