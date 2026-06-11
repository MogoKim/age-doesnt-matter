// LOCAL ONLY (GHA) — 회원 글 댓글 파동 처리 (wave1~5 순차 댓글 게시)
/**
 * 회원 글 댓글 파동 프로세서
 * UserPostWaveQueue에서 pending 항목을 찾아 댓글을 게시하고 done 처리.
 * GHA cron `*\/5 * * * *` 으로 실행
 *
 * 회원 글 1건당 총 5건의 자연 댓글 파동:
 *   wave1: +1분  × 1건 (GHA 주기상 실제 1~5분)
 *   wave2: +10분 × 1건
 *   wave3: +20분 × 1건
 *   wave4: +45분 × 1건
 *   wave5: +60분 × 1건
 */
import { prisma, disconnect } from '../core/db.js'
import { getBotUser, generateUserPostComment } from '../seed/generator.js'
import { getAllPersonaIds, getPersona } from '../seed/persona-data.js'
import { sendSlackMessage } from '../core/notifier.js'
import { notifyAuthorOfBotComment } from '../core/notify-author.js'
import { COMPETITOR_KEYWORDS } from './config.js'

type WaveNum = 1 | 2 | 3 | 4 | 5
type WaveDoneKey = 'wave1Done' | 'wave2Done' | 'wave3Done' | 'wave4Done' | 'wave5Done'
type WaveAtKey = 'wave1At' | 'wave2At' | 'wave3At' | 'wave4At' | 'wave5At'
type WaveCountKey = 'wave1Count' | 'wave2Count' | 'wave3Count' | 'wave4Count' | 'wave5Count'

type UserWaveQueue = {
  id: string
  postId: string
  authorId: string
  wave1Count: number
  wave2Count: number
  wave3Count: number
  wave4Count: number
  wave5Count: number
}

const ALL_PERSONA_IDS = getAllPersonaIds().filter(id => !id.startsWith('EN') && !/^N\d/.test(id))

const PERSONA_POOLS: Record<string, string[]> = {
  WORK: ['AS', 'AT', 'D', 'T', 'G', 'BA', 'I', 'AE', 'AR', 'AG'],
  FAMILY: ['E', 'K', 'BC', 'BD', 'BF', 'BH', 'AE', 'V'],
  CARE: ['W', 'AH', 'AK', 'AJ', 'AG', 'AE'],
  MONEY: ['B', 'N', 'AZ', 'AA', 'Y', 'AG'],
  GENERAL: ['V', 'AE', 'I', 'P', 'Q', 'AR', 'AD', 'T', 'G'],
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  WORK: ['회사', '팀장', '상사', '업무', '인사', '퇴사', '정년', '결재', '미팅', '업체', '단가', '공장', '직장', '출근'],
  FAMILY: ['남편', '아내', '자녀', '딸', '아들', '며느리', '시어머니', '가족', '부모'],
  CARE: ['간병', '병원', '수술', '입원', '치료', '재활', '돌봄', '아프'],
  MONEY: ['돈', '연금', '재테크', '절약', '물가', '노후', '생활비', '투자'],
}

function classifyUserPostTopic(title: string, content: string): string {
  const haystack = `${title} ${content}`.slice(0, 1200)
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(keyword => haystack.includes(keyword))) return topic
  }
  return 'GENERAL'
}

function getPersonaPoolForPost(title: string, content: string): string[] {
  const topic = classifyUserPostTopic(title, content)
  const preferred = PERSONA_POOLS[topic] ?? PERSONA_POOLS.GENERAL
  const existing = new Set(ALL_PERSONA_IDS)
  const pool = preferred.filter(id => existing.has(id))
  return pool.length > 0 ? pool : PERSONA_POOLS.GENERAL.filter(id => existing.has(id))
}

function pickPersona(pool: string[], usedPersonaIds: Set<string>): string | null {
  const available = pool.filter(id => !usedPersonaIds.has(id))
  if (available.length === 0) return null
  return available[Math.floor(Math.random() * available.length)] ?? null
}

async function processUserWave(
  queue: UserWaveQueue,
  waveNum: WaveNum,
): Promise<number> {
  const countKey = `wave${waveNum}Count` as WaveCountKey
  const count = Math.min(queue[countKey] ?? 1, 1)
  if (count < 1) return 0

  const post = await prisma.post.findUnique({
    where: { id: queue.postId },
    select: { title: true, content: true, status: true },
  })
  if (!post) {
    console.warn(`[UserPostWave] wave${waveNum}: postId=${queue.postId} 없음 — 스킵`)
    return 0
  }
  if (post.status !== 'PUBLISHED') {
    console.warn(`[UserPostWave] wave${waveNum}: postId=${queue.postId} status=${post.status} — 스킵`)
    return 0
  }

  // 경쟁사 언급 USER 글 파동 전체 중단
  const postSnippet = `${post.title} ${(post.content ?? '').slice(0, 500)}`
  if (COMPETITOR_KEYWORDS.some(kw => postSnippet.includes(kw))) {
    console.log(`[UserPostWave] 경쟁사 언급 글 파동 중단: ${queue.postId}`)
    return 0
  }

  // 이미 댓글 단 bot user UUID 집합 + 기존 댓글 내용 (표현 중복 방지)
  const existingComments = await prisma.comment.findMany({
    where: { postId: queue.postId },
    select: { authorId: true, content: true, author: { select: { email: true } } },
  })
  const existingAuthorIds = existingComments
    .map(c => c.authorId)
    .filter((id): id is string => Boolean(id))
  const usedUserIds = new Set([queue.authorId, ...existingAuthorIds])
  const priorCommentTexts = existingComments.map(c => c.content)
  const usedPersonaIds = new Set(
    existingComments
      .map(c => c.author?.email?.match(/^bot-([a-z0-9]+)@unao\.bot$/)?.[1]?.toUpperCase())
      .filter((id): id is string => Boolean(id)),
  )
  const personaPool = getPersonaPoolForPost(post.title, post.content ?? '')

  let successCount = 0

  for (let i = 0; i < count; i++) {
    const personaId = pickPersona(personaPool, usedPersonaIds)
    if (!personaId) break
    usedPersonaIds.add(personaId) // 이 이터레이션에서 사용됨으로 마킹

    const userId = await getBotUser(personaId)
    if (!userId) {
      console.warn(`[UserPostWave] wave${waveNum}: getBotUser(${personaId}) 실패 — 스킵`)
      continue
    }

    if (usedUserIds.has(userId)) continue // 이미 댓글 달았거나 글쓴이
    usedUserIds.add(userId)

    const commentText = await generateUserPostComment(personaId, post.title, post.content ?? '', [...priorCommentTexts])
    if (!commentText) {
      console.warn(`[UserPostWave] wave${waveNum}: 자연 댓글 생성 실패 — 스킵 (persona=${personaId}, nickname=${getPersona(personaId).nickname})`)
      continue
    }
    priorCommentTexts.push(commentText)

    await prisma.$transaction([
      prisma.comment.create({
        data: { postId: queue.postId, authorId: userId, content: commentText, status: 'ACTIVE' },
      }),
      prisma.post.update({
        where: { id: queue.postId },
        data: { commentCount: { increment: 1 } },
      }),
    ])

    successCount++
    console.log(`[UserPostWave] wave${waveNum} 자연 댓글 게시: postId=${queue.postId}, persona=${personaId}, nickname=${getPersona(personaId).nickname}`)

    // 봇 댓글 → 실고객 글쓴이에게 종 알림 (봇 글쓴이는 헬퍼에서 자동 제외)
    await notifyAuthorOfBotComment({ recipientUserId: queue.authorId, postId: queue.postId, botUserId: userId })
  }

  return successCount
}

export async function main() {
  const now = new Date()
  console.log('[UserPostWave] 회원 글 댓글 파동 처리 시작')
  let processed = 0
  let failed = 0

  // 만료 항목 정리
  const expired = await prisma.userPostWaveQueue.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  if (expired.count > 0) console.log(`[UserPostWave] 만료 정리: ${expired.count}건`)

  const processedQueueIds = new Set<string>()

  for (const waveNum of [1, 2, 3, 4, 5] as WaveNum[]) {
    const doneField = `wave${waveNum}Done` as WaveDoneKey
    const atField = `wave${waveNum}At` as WaveAtKey

    const pending = await prisma.userPostWaveQueue.findMany({
      where: {
        [doneField]: false,
        [atField]: { lte: now },
        expiresAt: { gte: now },
      },
      select: {
        id: true, postId: true, authorId: true,
        wave1Count: true, wave2Count: true, wave3Count: true, wave4Count: true, wave5Count: true,
      },
      take: 10,
    })

    for (const queue of pending) {
      if (processedQueueIds.has(queue.id)) continue
      try {
        const count = await processUserWave(queue, waveNum)
        processed += count
        processedQueueIds.add(queue.id)

        await prisma.userPostWaveQueue.update({
          where: { id: queue.id },
          data: { [`wave${waveNum}Done`]: true },
        })
      } catch (err) {
        failed++
        console.error(`[UserPostWave] wave${waveNum} 오류 (id=${queue.id}):`, err)
        await sendSlackMessage('QA', `[UserPostWave] wave${waveNum} 오류 (id=${queue.id}): ${String(err).slice(0, 100)}`)
      }
    }
  }

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'USER_POST_WAVE',
      status: failed === 0 ? 'SUCCESS' : processed > 0 ? 'PARTIAL' : 'FAILED',
      details: JSON.stringify({ processed, failed }),
      itemCount: processed,
    },
  })

  await disconnect()
  console.log(`[UserPostWave] 완료 — ${processed}건 처리, ${failed}건 실패`)
}

if (process.argv[1]?.endsWith('user-post-wave-processor.ts') || process.argv[1]?.endsWith('user-post-wave-processor.js')) {
  main().catch(async (err) => {
    console.error('[UserPostWave] 오류:', err)
    await disconnect()
    process.exit(1)
  })
}
