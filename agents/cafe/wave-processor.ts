// GHA ONLY — agents-cafe-wave.yml */5 cron으로 실행, Comment Wave 파동 처리 (wave1~4 순차 댓글 게시)
/**
 * 댓글 파동 프로세서 v2-E
 *
 * v2-E path (COMMENT_WAVE_V2_ENABLED=true, queue.createdAt >= V2_LAUNCH_DATE):
 *   - tier별 wave count (KILLER 최대 15, HOT 8~11, NORMAL 최대 5)
 *   - 원문 content 기반 dedup, AI fallback 완전 제거
 *   - 원글 작성자 대댓글 1:1 매핑 (flatMap 제거, fallback 제거)
 *   - 단계별 대댓글 허용 수 (wave2/3/4 piggybacked)
 *
 * legacy path (kill switch OFF 또는 createdAt < V2_LAUNCH_DATE):
 *   - 기존 4댓글 + 1대댓글 동작 그대로 유지
 */
import { prisma, disconnect } from '../core/db.js'
import { getBotUser } from '../seed/generator.js'
import { getAllPersonaIds } from '../seed/persona-data.js'
import { sendSlackMessage } from '../core/notifier.js'
import { parseTopComments } from './types.js'
import { replaceCafeReferences } from './curator-shared.js'
import { refreshPostTrendingScore } from '../core/post-trending.js'
import { computeUsableCount, removeEmoji } from './compute-usable-count.js'
import { isBotEngagementEnabledBoard, BOARD_ENGAGEMENT_DISABLED_REASON } from '../core/bot-engagement-policy.js'

// ── Kill Switch (v2-E) ──
const V2_ENABLED = process.env.COMMENT_WAVE_V2_ENABLED === 'true'
const V2_LAUNCH_DATE = new Date(process.env.COMMENT_WAVE_V2_DATE ?? '2099-01-01T00:00:00Z')

function isLegacyQueue(queue: { createdAt: Date }): boolean {
  return !V2_ENABLED || queue.createdAt < V2_LAUNCH_DATE
}

// 큐레이션 페르소나 — persona-data.ts에서 자동 생성 (EN/N계열 특수 페르소나 제외)
const COMMENTER_PERSONA_IDS = getAllPersonaIds()
  .filter(id => !id.startsWith('EN') && !/^N\d/.test(id))

// HUMOR 전용 페르소나 — persona-data.ts board:'HUMOR' 기준 (C/R/AF/AO/AP/AX/AY)
// STORY/LIFE2에서 제외. HUMOR 게시판은 전체 풀 허용. JOB은 별도 허용 목록 유지.
const HUMOR_ONLY_PERSONAS = new Set(['C', 'R', 'AF', 'AO', 'AP', 'AX', 'AY'])
const JOB_ALLOWED_PERSONAS = new Set(['AS', 'D'])

function boardPersonaFilter(boardType: string): (p: string) => boolean {
  if (boardType === 'JOB')                              return p => JOB_ALLOWED_PERSONAS.has(p)
  if (boardType === 'STORY' || boardType === 'LIFE2')   return p => !HUMOR_ONLY_PERSONAS.has(p)
  return () => true  // HUMOR·기타: 전체 풀
}

type WaveNum = 1 | 2 | 3 | 4
type WaveDoneKey = 'wave1Done' | 'wave2Done' | 'wave3Done' | 'wave4Done'
type WaveAtKey = 'wave1At' | 'wave2At' | 'wave3At' | 'wave4At'
type Tier = 'KILLER' | 'HOT' | 'NORMAL'

// ── v2-E 상수 ──

const KILLER_WAVE_COUNTS: Record<WaveNum, number> = { 1: 2, 2: 4, 3: 5, 4: 4 }
const NORMAL_WAVE_COUNTS: Record<WaveNum, number> = { 1: 1, 2: 1, 3: 2, 4: 1 }
const HOT_WAVE_COUNTS: Record<number, Record<WaveNum, number>> = {
  8:  { 1: 1, 2: 2, 3: 3, 4: 2 },
  9:  { 1: 2, 2: 2, 3: 3, 4: 2 },
  10: { 1: 2, 2: 2, 3: 3, 4: 3 },
  11: { 1: 2, 2: 3, 3: 3, 4: 3 },
}

// ── v2-E 유틸 함수 ──

function normalizeNickname(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/\([^)]+\)/g, '')
    .replace(/[^\w가-힣]/g, '')
    .toLowerCase()
    .trim()
}

function deterministicTargetCount(cafePostId: string, min: number, max: number): number {
  let h = 0
  for (let i = 0; i < cafePostId.length; i++) {
    h = Math.imul(31, h) + cafePostId.charCodeAt(i)
    h |= 0
  }
  return min + (Math.abs(h) % (max - min + 1))
}


// bot당 일일 최대 댓글 수 (legacy/v2 공통) — bot_cap 문제 완화를 위해 3→8로 상향 (2026-05-30)
const BOT_DAILY_COMMENT_CAP = 8

function getGlobalCap(tier: Tier): number {
  if (tier === 'KILLER') return 20
  if (tier === 'HOT')    return 14
  return 6
}

function getWaveTargetCount(tier: Tier, waveNum: WaveNum, cafePostId: string): number {
  if (tier === 'KILLER') return KILLER_WAVE_COUNTS[waveNum]
  if (tier === 'NORMAL') return NORMAL_WAVE_COUNTS[waveNum]
  const total = deterministicTargetCount(cafePostId, 8, 11)
  return HOT_WAVE_COUNTS[total][waveNum]
}

function getAllowedReplyCount(tier: Tier, waveNum: WaveNum): number {
  if (tier === 'KILLER') return waveNum === 2 ? 1 : waveNum === 3 ? 2 : 4
  if (tier === 'HOT')    return waveNum === 2 ? 1 : waveNum === 3 ? 2 : 3
  return waveNum === 4 ? 1 : 0  // NORMAL: wave4에서만
}

async function getQueueTier(postId: string, cafePostId: string): Promise<Tier> {
  const [post, cafePost] = await Promise.all([
    prisma.post.findUnique({ where: { id: postId }, select: { isFeatured: true } }),
    prisma.cafePost.findUnique({ where: { id: cafePostId }, select: { killerScore: true, isPopular: true } }),
  ])
  if (post?.isFeatured || (cafePost?.killerScore ?? 0) >= 75) return 'KILLER'
  if (cafePost?.isPopular) return 'HOT'
  return 'NORMAL'
}

// 작성자 대댓글 fallback 풀 (legacy path 전용)
const AUTHOR_REPLY_POOL = [
  '공감해 주셔서 감사해요~',
  '맞아요 저도 그렇게 생각해요 ^^',
  '좋은 말씀 감사합니다',
  '그러게요 저도 비슷한 경험이 있어요',
  '이렇게 공감해 주시니 힘이 나요',
  '맞아요 맞아요 ^^',
  '함께 나눠 주셔서 감사해요',
]

// ── Legacy 함수 (기존 로직 그대로 유지 — 변경 금지) ──

async function processAuthorReplyLegacy(
  queue: { id: string; postId: string; cafePostId: string; authorPersonaId: string },
  authorUserId: string
) {
  const firstComment = await prisma.comment.findFirst({
    where: {
      postId: queue.postId,
      parentId: null,
      status: 'ACTIVE',
      authorId: { not: authorUserId },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (!firstComment) return

  const cafePost = await prisma.cafePost.findUnique({
    where: { id: queue.cafePostId },
    select: { topComments: true },
  })
  type TC = { content: string; replies?: Array<{ content: string }> }
  const topComments = (cafePost?.topComments as TC[]) ?? []
  const replyFromOriginal = topComments
    .flatMap(c => c.replies ?? [])
    .find(r => r.content?.trim().length >= 5)
    ?.content?.trim()

  const replyText = replyFromOriginal
    ?? AUTHOR_REPLY_POOL[Math.floor(Math.random() * AUTHOR_REPLY_POOL.length)]

  await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId: queue.postId,
        authorId: authorUserId,
        content: replyText,
        parentId: firstComment.id,
        status: 'ACTIVE',
      },
    }),
    prisma.post.update({
      where: { id: queue.postId },
      data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
    }),
  ])
  await refreshPostTrendingScore(queue.postId).catch(() => {})
  console.log(`[WaveProcessor] 작성자 대댓글(legacy): postId=${queue.postId}`)
}

async function processWaveLegacy(
  queue: { id: string; postId: string; cafePostId: string; authorPersonaId: string },
  waveNum: WaveNum,
) {
  const todayCommentStart = new Date()
  todayCommentStart.setHours(0, 0, 0, 0)

  const [legacyTier, legacyPost] = await Promise.all([
    getQueueTier(queue.postId, queue.cafePostId),
    prisma.post.findUnique({ where: { id: queue.postId }, select: { boardType: true } }),
  ])
  const legacyBoardType = legacyPost?.boardType ?? ''

  const botUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@unao.bot' } },
    select: { id: true },
  })
  const botUserIds = botUsers.map(u => u.id)
  const todayCommentCounts = await prisma.comment.groupBy({
    by: ['authorId'],
    where: { createdAt: { gte: todayCommentStart }, authorId: { in: botUserIds } },
    _count: { authorId: true },
  })
  const todayCountByUser = new Map(
    todayCommentCounts.map(c => [c.authorId, c._count.authorId])
  )

  const basePool = [
    ...COMMENTER_PERSONA_IDS
      .filter(p => p !== queue.authorPersonaId)
      .filter(boardPersonaFilter(legacyBoardType)),
  ].sort(() => Math.random() - 0.5)
  let personaId = basePool[0]
  let userId: string | null = null
  for (const candidate of basePool) {
    const cid = await getBotUser(candidate)
    if (!cid) continue
    if ((todayCountByUser.get(cid) ?? 0) < BOT_DAILY_COMMENT_CAP) {
      personaId = candidate
      userId = cid
      break
    }
  }
  // fallback: 모두 캡 초과 시 첫 번째 후보 (legacy 동작 유지)
  if (!userId) {
    personaId = basePool[0]
    userId = await getBotUser(personaId)
  }
  if (!userId) {
    console.warn(`[WaveProcessor] wave${waveNum}(legacy): getBotUser(${personaId}) 실패 — 스킵`)
    return
  }

  const existingComment = await prisma.comment.findFirst({
    where: { postId: queue.postId, authorId: userId },
  })
  if (existingComment) {
    const doneFieldEarly = `wave${waveNum}Done` as WaveDoneKey
    await prisma.commentWaveQueue.update({ where: { id: queue.id }, data: { [doneFieldEarly]: true } })
    console.warn(`[WaveProcessor] wave${waveNum}(legacy): 중복 댓글 스킵 (postId=${queue.postId}, persona=${personaId})`)
    return
  }

  const totalBotComments = await prisma.comment.count({
    where: {
      postId: queue.postId,
      author: { email: { endsWith: '@unao.bot' } },
      status: 'ACTIVE',
    },
  })
  if (totalBotComments >= getGlobalCap(legacyTier)) {
    const doneFieldCap = `wave${waveNum}Done` as WaveDoneKey
    await prisma.commentWaveQueue.update({ where: { id: queue.id }, data: { [doneFieldCap]: true } })
    console.warn(`[WaveProcessor] wave${waveNum}(legacy): 봇 댓글 캡 초과(${totalBotComments}건) — 스킵 (postId=${queue.postId})`)
    return
  }

  const post = await prisma.post.findUnique({
    where: { id: queue.postId },
    select: { title: true },
  })
  if (!post) {
    console.warn(`[WaveProcessor] wave${waveNum}(legacy): postId=${queue.postId} 없음 — 스킵`)
    return
  }

  const cafePost = await prisma.cafePost.findUnique({
    where: { id: queue.cafePostId },
    select: { topComments: true, viralType: true },
  })
  const topComments = cafePost?.topComments as { content: string }[] | null
  const len = topComments?.length ?? 0
  const idx = len > 0 ? ((waveNum - 1) * Math.ceil(len / 4)) % len : 0
  const refComment = len > 0 ? topComments![idx]?.content : undefined
  const usableCount = computeUsableCount(topComments)

  // BLOCK 1: title-only AI 완전 차단 — refComment 없거나 10자 미만이면 스킵
  if (!refComment || refComment.trim().length < 10) {
    const doneFieldBlk = `wave${waveNum}Done` as WaveDoneKey
    await prisma.commentWaveQueue.update({ where: { id: queue.id }, data: { [doneFieldBlk]: true } })
    console.log(`[WaveProcessor] wave${waveNum}(legacy): 원본 댓글 없음 — title-only AI 차단, 스킵 (postId=${queue.postId})`)
    return
  }
  // BLOCK 2: 최대 usable 수 한도 (usable 1~4개 케이스, 기존 bot 댓글 수 >= usable이면 스킵)
  if (usableCount < 5 && totalBotComments >= usableCount) {
    const doneFieldCap2 = `wave${waveNum}Done` as WaveDoneKey
    await prisma.commentWaveQueue.update({ where: { id: queue.id }, data: { [doneFieldCap2]: true } })
    console.log(`[WaveProcessor] wave${waveNum}(legacy): 원본 댓글 한도(최대 ${usableCount}개) 도달 — 스킵 (postId=${queue.postId})`)
    return
  }
  const commentText = refComment.trim()

  await prisma.$transaction([
    prisma.comment.create({
      data: {
        postId: queue.postId,
        authorId: userId,
        content: commentText,
        status: 'ACTIVE',
      },
    }),
    prisma.post.update({
      where: { id: queue.postId },
      data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
    }),
  ])
  await refreshPostTrendingScore(queue.postId).catch(() => {})

  const doneField = `wave${waveNum}Done` as WaveDoneKey
  await prisma.commentWaveQueue.update({
    where: { id: queue.id },
    data: { [doneField]: true },
  })

  console.log(`[WaveProcessor] wave${waveNum}(legacy) 완료: postId=${queue.postId}, persona=${personaId}`)
}

// ── v2-E 함수 ──

async function processAuthorRepliesV2(
  queue: { id: string; postId: string; cafePostId: string },
  tier: Tier,
  allowedReplyCount: number,
  authorUserId: string,
) {
  if (allowedReplyCount <= 0) return

  const cafePost = await prisma.cafePost.findUnique({
    where: { id: queue.cafePostId },
    select: { topComments: true, author: true },
  })
  if (!cafePost) return

  const topComments = parseTopComments(cafePost.topComments)
  if (topComments.length === 0) return

  const cafeAuthor = normalizeNickname(cafePost.author ?? '')
  const topCommentByContent = new Map(topComments.map(tc => [removeEmoji(replaceCafeReferences(tc.content.trim())), tc]))

  // v2 source-copy 봇 댓글만 조회 (content 매칭)
  const botComments = await prisma.comment.findMany({
    where: {
      postId: queue.postId,
      parentId: null,
      status: 'ACTIVE',
      author: { email: { endsWith: '@unao.bot' } },
      authorId: { not: authorUserId },
      content: { in: [...topCommentByContent.keys()] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, content: true },
  })
  if (botComments.length === 0) return

  const botCommentIds = new Set(botComments.map(b => b.id))

  // 이미 생성된 대댓글 중 v2 source-copy botComment에 달린 것만 카운트
  const existingReplies = await prisma.comment.findMany({
    where: { postId: queue.postId, authorId: authorUserId, parentId: { not: null } },
    select: { parentId: true, content: true },
  })
  const usedParentIds = new Set(
    existingReplies.filter(r => botCommentIds.has(r.parentId!)).map(r => r.parentId!)
  )
  const usedContents = new Set(
    existingReplies.filter(r => botCommentIds.has(r.parentId!)).map(r => r.content.trim())
  )

  // globalCap 체크 — processWaveV2 완료 후 총 봇 댓글 수가 cap에 도달했으면 author reply 생략
  const globalCap = getGlobalCap(tier)
  const preTotalBotCount = await prisma.comment.count({
    where: {
      postId: queue.postId,
      author: { email: { endsWith: '@unao.bot' } },
      status: 'ACTIVE',
    },
  })
  const effectiveAllowed = Math.min(allowedReplyCount, Math.max(0, globalCap - preTotalBotCount))

  let replyCount = usedParentIds.size
  if (replyCount >= effectiveAllowed || effectiveAllowed === 0) return
  const initialReplyCount = replyCount

  for (const botComment of botComments) {
    if (replyCount >= effectiveAllowed) break
    if (usedParentIds.has(botComment.id)) continue

    const sourceTopComment = topCommentByContent.get(botComment.content.trim())
    if (!sourceTopComment) continue

    const authorReply = (sourceTopComment.replies ?? []).find(r =>
      normalizeNickname(r.author) === cafeAuthor &&
      r.content.trim().length >= 5 &&
      !usedContents.has(removeEmoji(replaceCafeReferences(r.content.trim())))
    )
    if (!authorReply) continue

    const replyContent = removeEmoji(replaceCafeReferences(authorReply.content.trim()))

    await prisma.$transaction([
      prisma.comment.create({
        data: {
          postId: queue.postId,
          authorId: authorUserId,
          content: replyContent,
          parentId: botComment.id,
          status: 'ACTIVE',
        },
      }),
      prisma.post.update({
        where: { id: queue.postId },
        data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
      }),
    ])

    usedParentIds.add(botComment.id)
    usedContents.add(replyContent)
    replyCount++
  }

  if (replyCount > initialReplyCount) await refreshPostTrendingScore(queue.postId).catch(() => {})
  console.log(`[WaveProcessor] v2 대댓글: postId=${queue.postId}, count=${replyCount}/${allowedReplyCount}`)
}

async function processWaveV2(
  queue: { id: string; postId: string; cafePostId: string; authorPersonaId: string },
  waveNum: WaveNum,
  tier: Tier,
  authorUserId: string,
) {
  const skips: string[] = []
  let actualCount = 0
  let normalExit = false
  const doneField = `wave${waveNum}Done` as WaveDoneKey
  const waveTargetCount = getWaveTargetCount(tier, waveNum, queue.cafePostId)
  const globalCap = getGlobalCap(tier)

  try {
    // 원본 topComments 파싱 + 게시판 타입 조회 (병렬)
    const [cafePost, postForBoard] = await Promise.all([
      prisma.cafePost.findUnique({
        where: { id: queue.cafePostId },
        select: { topComments: true },
      }),
      prisma.post.findUnique({
        where: { id: queue.postId },
        select: { boardType: true },
      }),
    ])
    if (!cafePost) {
      skips.push('source_not_found')
      normalExit = true
      return
    }
    const boardType = postForBoard?.boardType ?? ''

    const topComments = parseTopComments(cafePost.topComments)
    if (topComments.length === 0) {
      skips.push('source_not_enough')
      normalExit = true
      return
    }

    // 기존 v2 bot top-level 댓글 content Set 구성
    const existingBotComments = await prisma.comment.findMany({
      where: {
        postId: queue.postId,
        parentId: null,
        status: 'ACTIVE',
        author: { email: { endsWith: '@unao.bot' } },
        ...(authorUserId ? { authorId: { not: authorUserId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, authorId: true, content: true },
    })

    const usedContentSet = new Set(existingBotComments.map(c => c.content.trim()))

    // 아직 복사되지 않은 원문 candidates 추출 (순서 유지)
    const sourceCandidates: string[] = []
    for (const tc of topComments) {
      const text = removeEmoji(replaceCafeReferences(tc.content?.trim() ?? ''))
      if (text.length < 10) continue
      if (usedContentSet.has(text)) continue
      sourceCandidates.push(text)
    }

    if (sourceCandidates.length === 0) {
      skips.push('source_not_enough')
      normalExit = true
      return
    }

    // bot daily cap 집계
    const todayCommentStart = new Date()
    todayCommentStart.setHours(0, 0, 0, 0)
    const botUsers = await prisma.user.findMany({
      where: { email: { endsWith: '@unao.bot' } },
      select: { id: true },
    })
    const botUserIds = botUsers.map(u => u.id)
    const todayCommentCounts = await prisma.comment.groupBy({
      by: ['authorId'],
      where: { createdAt: { gte: todayCommentStart }, authorId: { in: botUserIds } },
      _count: { authorId: true },
    })
    const todayCountByUser = new Map(
      todayCommentCounts.map(c => [c.authorId, c._count.authorId])
    )

    const existingCommenters = new Set(existingBotComments.map(c => c.authorId))
    const usedInThisRun = new Set<string>()

    for (let slot = 0; slot < waveTargetCount; slot++) {
      const commentText = sourceCandidates[slot]
      if (!commentText) { skips.push('source_not_enough'); break }

      // global cap 체크
      const totalBotCount = await prisma.comment.count({
        where: {
          postId: queue.postId,
          author: { email: { endsWith: '@unao.bot' } },
          status: 'ACTIVE',
        },
      })
      if (totalBotCount >= globalCap) { skips.push('global_cap'); break }

      // 봇 후보 선택 (중복 없는 봇만, 강제 선택 금지, 게시판별 페르소나 제한)
      const candidates = [...COMMENTER_PERSONA_IDS]
        .filter(p => p !== queue.authorPersonaId)
        .filter(boardPersonaFilter(boardType))
        .sort(() => Math.random() - 0.5)

      let chosen: { personaId: string; userId: string } | null = null
      for (const personaId of candidates) {
        const userId = await getBotUser(personaId)
        if (!userId) continue
        if (existingCommenters.has(userId)) continue
        if (usedInThisRun.has(userId)) continue
        if ((todayCountByUser.get(userId) ?? 0) >= BOT_DAILY_COMMENT_CAP) continue
        chosen = { personaId, userId }
        break
      }

      if (!chosen) { skips.push('bot_cap'); continue }

      await prisma.$transaction([
        prisma.comment.create({
          data: {
            postId: queue.postId,
            authorId: chosen.userId,
            content: commentText,
            status: 'ACTIVE',
          },
        }),
        prisma.post.update({
          where: { id: queue.postId },
          data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() },
        }),
      ])

      usedInThisRun.add(chosen.userId)
      existingCommenters.add(chosen.userId)
      usedContentSet.add(commentText)
      actualCount++
    }

    // bot_cap/global_cap으로 50% 미만 생성 시 Slack warning
    if (
      actualCount < waveTargetCount / 2 &&
      skips.some(s => s === 'bot_cap' || s === 'global_cap')
    ) {
      await sendSlackMessage('QA',
        `[WaveProcessor v2] wave${waveNum} cap 부족 — postId=${queue.postId}, tier=${tier}, target=${waveTargetCount}, actual=${actualCount}`
      )
    }

    normalExit = true

  } finally {
    // normalExit=true인 경우만 waveXDone 마킹 (exception 시 false → 재시도 허용)
    if (normalExit) {
      await prisma.commentWaveQueue.update({
        where: { id: queue.id },
        data: { [doneField]: true },
      })

      await prisma.botLog.create({
        data: {
          botType: 'CAFE_CRAWLER',
          action: 'WAVE_PROCESS_V2',
          status: actualCount === 0 ? 'SKIP'
                 : actualCount < waveTargetCount ? 'PARTIAL' : 'SUCCESS',
          details: JSON.stringify({
            postId:         queue.postId,
            waveNum,
            tier,
            targetCount:    waveTargetCount,
            actualCreated:  actualCount,
            skippedReasons: skips,
          }),
          itemCount: actualCount,
        },
      })

      console.log(
        `[WaveProcessor] wave${waveNum}(v2) 완료: postId=${queue.postId}, tier=${tier}, created=${actualCount}/${waveTargetCount}`
      )
      if (actualCount > 0) await refreshPostTrendingScore(queue.postId).catch(() => {})
    }
  }
}

// ── v2-F pre-check: processWaveV2 내부와 동일한 sourceCandidates 기준으로 사전 판정 ──
async function getV2SourceCandidates(
  queue: { postId: string; cafePostId: string },
  authorUserId: string,
): Promise<string[]> {
  const cafePost = await prisma.cafePost.findUnique({
    where: { id: queue.cafePostId },
    select: { topComments: true },
  })
  if (!cafePost) return []

  const topComments = parseTopComments(cafePost.topComments)
  if (topComments.length === 0) return []

  const existingBotComments = await prisma.comment.findMany({
    where: {
      postId: queue.postId,
      parentId: null,
      status: 'ACTIVE',
      author: { email: { endsWith: '@unao.bot' } },
      ...(authorUserId ? { authorId: { not: authorUserId } } : {}),
    },
    select: { content: true },
  })
  const usedContentSet = new Set(existingBotComments.map(c => c.content.trim()))

  const candidates: string[] = []
  for (const tc of topComments) {
    const text = removeEmoji(replaceCafeReferences(tc.content?.trim() ?? ''))
    if (text.length < 10) continue
    if (usedContentSet.has(text)) continue
    candidates.push(text)
  }
  return candidates
}

export async function main() {
  const now = new Date()
  console.log('[WaveProcessor] 댓글 파동 처리 시작')
  let processed = 0
  let failed = 0

  // 만료 항목 정리
  const expired = await prisma.commentWaveQueue.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  if (expired.count > 0) console.log(`[WaveProcessor] 만료 정리: ${expired.count}건`)

  // wave1~4 순서대로 처리
  for (const waveNum of [1, 2, 3, 4] as WaveNum[]) {
    const doneField = `wave${waveNum}Done` as WaveDoneKey
    const atField = `wave${waveNum}At` as WaveAtKey

    const pending = await prisma.commentWaveQueue.findMany({
      where: {
        [doneField]: false,
        [atField]: { lte: now },
        expiresAt: { gte: now },
      },
      select: { id: true, postId: true, cafePostId: true, authorPersonaId: true, createdAt: true },
      take: 10,
    })

    for (const queue of pending) {
      try {
        // MAGAZINE/JOB 등 봇 engagement 미운영 board → 큐 done 처리 후 skip
        // (legacy/v2 공통 방어 + 레거시 큐가 남아도 wave 전체 done 처리해 반복 실행 방지)
        const boardCheck = await prisma.post.findUnique({ where: { id: queue.postId }, select: { boardType: true } })
        if (!isBotEngagementEnabledBoard(boardCheck?.boardType)) {
          await prisma.commentWaveQueue.update({
            where: { id: queue.id },
            data: { wave1Done: true, wave2Done: true, wave3Done: true, wave4Done: true },
          })
          console.log(`[WaveProcessor] ${BOARD_ENGAGEMENT_DISABLED_REASON} (${boardCheck?.boardType}) — 큐 done 처리 후 skip (postId=${queue.postId})`)
          continue
        }
        if (isLegacyQueue(queue)) {
          await processWaveLegacy(queue, waveNum)
        } else {
          const [tier, post, cafePostUsable] = await Promise.all([
            getQueueTier(queue.postId, queue.cafePostId),
            prisma.post.findUnique({ where: { id: queue.postId }, select: { authorId: true } }),
            queue.cafePostId
              ? prisma.cafePost.findUnique({ where: { id: queue.cafePostId }, select: { topComments: true } })
              : Promise.resolve(null),
          ])
          const authorUserId = post?.authorId ?? ''
          const dispatchUsable = computeUsableCount(cafePostUsable?.topComments)

          // v2-F: sourceCandidates 사전 판정 (processWaveV2 내부와 동일 기준)
          const waveTargetCount = getWaveTargetCount(tier, waveNum, queue.cafePostId)
          const sourceCandidates = await getV2SourceCandidates(queue, authorUserId)

          if (sourceCandidates.length >= waveTargetCount) {
            // V2 정상 경로 (sourceCandidates 충분)
            await processWaveV2(queue, waveNum, tier, authorUserId)

            // wave2/3/4 완료 직후 v2 대댓글 처리 (piggybacked) — usable >= 5일 때만
            if (waveNum >= 2 && authorUserId && dispatchUsable >= 5) {
              const allowed = getAllowedReplyCount(tier, waveNum)
              if (allowed > 0) {
                await processAuthorRepliesV2(queue, tier, allowed, authorUserId)
              }
            }
          } else {
            // V2 fallback → legacy (sourceCandidates 부족)
            console.log(
              `[WaveProcessor] wave${waveNum}(v2-fallback→legacy): postId=${queue.postId}, reason=source_not_enough, available=${sourceCandidates.length}, target=${waveTargetCount}`
            )
            await processWaveLegacy(queue, waveNum)

            // wave4에서만 대댓글 처리 (R1: inline, alreadyReplied 체크로 중복 방지) — usable >= 5일 때만
            if (waveNum === 4 && authorUserId && dispatchUsable >= 5) {
              try {
                const alreadyReplied = await prisma.comment.findFirst({
                  where: { postId: queue.postId, authorId: authorUserId, parentId: { not: null } },
                })
                if (!alreadyReplied) {
                  await processAuthorReplyLegacy(queue, authorUserId)
                } else {
                  console.log(`[WaveProcessor] wave4(v2-fallback→legacy): 대댓글 이미 존재, 스킵 postId=${queue.postId}`)
                }
              } catch (err) {
                console.error(`[WaveProcessor] wave4(v2-fallback→legacy): 대댓글 오류 postId=${queue.postId}`, err)
              }
            }
          }
        }
        processed++
      } catch (err) {
        failed++
        console.error(`[WaveProcessor] wave${waveNum} 오류 (id=${queue.id}):`, err)
        await sendSlackMessage('QA', `[WaveProcessor] wave${waveNum} 오류 (id=${queue.id}): ${String(err).slice(0, 100)}`)
      }
    }
  }

  // legacy 대댓글 처리 (wave4Done=true, legacy queue만)
  const replyPending = await prisma.commentWaveQueue.findMany({
    where: { wave4Done: true, expiresAt: { gte: now } },
    select: { id: true, postId: true, cafePostId: true, authorPersonaId: true, createdAt: true },
    take: 10,
  })
  for (const queue of replyPending) {
    if (!isLegacyQueue(queue)) continue  // v2는 wave 직후 처리 완료
    // usable < 5이면 author reply 스킵 (댓글 부풀리기 방지)
    const cpReply = queue.cafePostId
      ? await prisma.cafePost.findUnique({ where: { id: queue.cafePostId }, select: { topComments: true } })
      : null
    if (computeUsableCount(cpReply?.topComments) < 5) {
      console.log(`[WaveProcessor] wave4-reply(legacy): usable < 5 — 대댓글 스킵 (postId=${queue.postId})`)
      continue
    }
    const post = await prisma.post.findUnique({
      where: { id: queue.postId },
      select: { authorId: true, boardType: true },
    })
    if (!post?.authorId) continue
    // MAGAZINE/JOB 등 봇 engagement 미운영 board → 대댓글 skip
    if (!isBotEngagementEnabledBoard(post.boardType)) continue
    const alreadyReplied = await prisma.comment.findFirst({
      where: { postId: queue.postId, authorId: post.authorId, parentId: { not: null } },
    })
    if (alreadyReplied) continue
    try {
      await processAuthorReplyLegacy(queue, post.authorId)
      processed++
    } catch (err) {
      failed++
      console.error('[WaveProcessor] 작성자 대댓글 오류(legacy):', err)
    }
  }

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'WAVE_PROCESS',
      status: failed === 0 ? 'SUCCESS' : processed > 0 ? 'PARTIAL' : 'FAILED',
      details: JSON.stringify({ processed, failed }),
      itemCount: processed,
    },
  })

  await disconnect()
  console.log(`[WaveProcessor] 완료 — ${processed}건 처리, ${failed}건 실패`)
}

if (process.argv[1]?.endsWith('wave-processor.ts') || process.argv[1]?.endsWith('wave-processor.js')) {
  main().catch(async (err) => {
    console.error('[WaveProcessor] 오류:', err)
    await disconnect()
    process.exit(1)
  })
}
