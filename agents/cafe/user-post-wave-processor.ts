// LOCAL ONLY (GHA) — 회원 글 댓글 파동 처리 (wave1~4 순차 댓글 게시)
/**
 * 회원 글 댓글 파동 프로세서
 * UserPostWaveQueue에서 pending 항목을 찾아 댓글을 게시하고 done 처리.
 * GHA cron `*\/5 * * * *` 으로 실행
 *
 * 회원 글 1건당 총 9건의 댓글 파동:
 *   wave1: +1분  × 1건
 *   wave2: +10분 × 2건
 *   wave3: +30분 × 3건
 *   wave4: +60분 × 3건
 */
import { prisma, disconnect } from '../core/db.js'
import { getBotUser, generateComment } from '../seed/generator.js'
import { getAllPersonaIds } from '../seed/persona-data.js'
import { sendSlackMessage } from '../core/notifier.js'
import { COMPETITOR_KEYWORDS } from './config.js'

const HUMOR_ONLY_PERSONAS = ['C', 'AF', 'AO', 'AY']  // HUMOR 보드 전담 — 실제 회원 글 wave 제외
const COMMENTER_PERSONA_IDS = getAllPersonaIds()
  .filter(id => !id.startsWith('EN') && !/^N\d/.test(id))
  .filter(id => !HUMOR_ONLY_PERSONAS.includes(id))

type WaveNum = 1 | 2 | 3 | 4
type WaveDoneKey = 'wave1Done' | 'wave2Done' | 'wave3Done' | 'wave4Done'
type WaveAtKey = 'wave1At' | 'wave2At' | 'wave3At' | 'wave4At'
type WaveCountKey = 'wave1Count' | 'wave2Count' | 'wave3Count' | 'wave4Count'

async function processUserWave(
  queue: { id: string; postId: string; authorId: string; wave1Count: number; wave2Count: number; wave3Count: number; wave4Count: number },
  waveNum: WaveNum,
): Promise<number> {
  const countKey = `wave${waveNum}Count` as WaveCountKey
  const count = queue[countKey]

  const post = await prisma.post.findUnique({
    where: { id: queue.postId },
    select: { title: true, content: true },
  })
  if (!post) {
    console.warn(`[UserPostWave] wave${waveNum}: postId=${queue.postId} 없음 — 스킵`)
    return 0
  }

  // 경쟁사 언급 USER 글 파동 전체 중단
  const postSnippet = `${post.title} ${(post.content ?? '').slice(0, 500)}`
  if (COMPETITOR_KEYWORDS.some(kw => postSnippet.includes(kw))) {
    console.log(`[UserPostWave] 경쟁사 언급 글 파동 중단: ${queue.postId}`)
    return 0
  }

  // 이미 댓글 단 bot user UUID 집합 (중복 방지)
  const existingComments = await prisma.comment.findMany({
    where: { postId: queue.postId },
    select: { authorId: true },
  })
  const usedUserIds = new Set(existingComments.map(c => c.authorId))
  const usedPersonaIds = new Set<string>()

  let successCount = 0

  for (let i = 0; i < count; i++) {
    const available = COMMENTER_PERSONA_IDS.filter(id => !usedPersonaIds.has(id))
    if (available.length === 0) break

    const personaId = available[Math.floor(Math.random() * available.length)]
    usedPersonaIds.add(personaId) // 이 이터레이션에서 사용됨으로 마킹

    const userId = await getBotUser(personaId)
    if (!userId) {
      console.warn(`[UserPostWave] wave${waveNum}: getBotUser(${personaId}) 실패 — 스킵`)
      continue
    }

    if (usedUserIds.has(userId)) continue // 이미 댓글 달았거나 글쓴이
    usedUserIds.add(userId)

    const commentText = await generateComment(personaId, post.title, post.content ?? '')

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
    console.log(`[UserPostWave] wave${waveNum} 댓글 게시: postId=${queue.postId}, persona=${personaId}`)
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

  for (const waveNum of [1, 2, 3, 4] as WaveNum[]) {
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
        wave1Count: true, wave2Count: true, wave3Count: true, wave4Count: true,
      },
      take: 10,
    })

    for (const queue of pending) {
      try {
        const count = await processUserWave(queue, waveNum)
        processed += count

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
