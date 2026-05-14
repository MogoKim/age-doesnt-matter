// LOCAL ONLY (GHA) — Comment Wave 파동 처리 (wave1~4 순차 댓글 게시)
/**
 * 댓글 파동 프로세서
 * CommentWaveQueue에서 pending 항목을 찾아 댓글을 게시하고 done 처리.
 * GHA cron `*\/5 * * * *` 으로 실행 (wave1: +1분, wave2: +5분, wave3: +30분, wave4: +60분)
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { getBotUser } from '../seed/generator.js'
import { getAllPersonaIds } from '../seed/persona-data.js'
import { sendSlackMessage } from '../core/notifier.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

// 큐레이션 페르소나 — persona-data.ts에서 자동 생성 (EN/N계열 특수 페르소나 제외)
const COMMENTER_PERSONA_IDS = getAllPersonaIds()
  .filter(id => !id.startsWith('EN') && !/^N\d/.test(id))

type WaveNum = 1 | 2 | 3 | 4
type WaveDoneKey = 'wave1Done' | 'wave2Done' | 'wave3Done' | 'wave4Done'
type WaveAtKey = 'wave1At' | 'wave2At' | 'wave3At' | 'wave4At'

// wave별 댓글 유형 강제 — fallback(refComment 없음) 시 획일화 방지
const WAVE_COMMENT_TYPES: Record<WaveNum, string> = {
  1: '공감형 — 글쓴이와 같은 감정을 공유하는 한마디 (예: "저도 비슷한 경험이 있어요")',
  2: '질문형 — 글 내용에 대해 궁금한 점을 물어보는 댓글 (예: "혹시 ~해보셨나요?")',
  3: '경험공유형 — 본인의 비슷한 경험을 짧게 공유 (예: "저는 ~해서 많이 나아졌어요")',
  4: '응원형 — 따뜻하게 격려하는 한마디 (예: "힘내세요! 곧 좋아질 거예요")',
}

async function generateComment(postTitle: string, waveNum: WaveNum, refComment?: string): Promise<string> {
  const waveType = WAVE_COMMENT_TYPES[waveNum]
  const content = refComment
    ? `아래 원본 댓글을 참고해 새 댓글을 작성하세요.
원본 댓글: "${refComment.slice(0, 150)}"
글 제목: "${postTitle}"

규칙:
- 댓글 유형: ${waveType}
- 원본의 핵심 주제(고유명사·수치)만 유지, 표현은 자유롭게
- 40~80자 이내, 순수 텍스트만, 마크다운/이모지 금지
- 접두사 없이 댓글 내용만 출력

댓글:`
    : `50-60대 여성 커뮤니티 회원으로서 아래 글에 짧은 댓글을 써주세요.
글 제목: "${postTitle}"

규칙:
- 댓글 유형: ${waveType}
- 40~80자 이내, 순수 텍스트만
- 마크다운/이모지 금지
- 자연스러운 구어체 (경어 또는 반말)

댓글:`

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 120,
    messages: [{ role: 'user', content }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return raw.replace(/^댓글:\s*/, '').slice(0, 200)
}

async function processWave(
  queue: { id: string; postId: string; cafePostId: string; authorPersonaId: string },
  waveNum: WaveNum,
) {
  // 글쓴이 제외 랜덤 페르소나
  const available = COMMENTER_PERSONA_IDS.filter(p => p !== queue.authorPersonaId)
  const personaId = available[Math.floor(Math.random() * available.length)]
  const userId = await getBotUser(personaId)
  if (!userId) {
    console.warn(`[WaveProcessor] wave${waveNum}: getBotUser(${personaId}) 실패 — 스킵`)
    return
  }

  // 중복 댓글 방지 — 동시 실행 또는 재시도 시 같은 페르소나가 이미 댓글 달았으면 스킵
  const existingComment = await prisma.comment.findFirst({
    where: { postId: queue.postId, authorId: userId },
  })
  if (existingComment) {
    const doneFieldEarly = `wave${waveNum}Done` as WaveDoneKey
    await prisma.commentWaveQueue.update({ where: { id: queue.id }, data: { [doneFieldEarly]: true } })
    console.warn(`[WaveProcessor] wave${waveNum}: 중복 댓글 스킵 (postId=${queue.postId}, persona=${personaId})`)
    return
  }

  // 포스트 제목 조회
  const post = await prisma.post.findUnique({
    where: { id: queue.postId },
    select: { title: true },
  })
  if (!post) {
    console.warn(`[WaveProcessor] wave${waveNum}: postId=${queue.postId} 없음 — 스킵`)
    return
  }

  // 원본 카페글 topComments 참조
  const cafePost = await prisma.cafePost.findUnique({
    where: { id: queue.cafePostId },
    select: { topComments: true },
  })
  const topComments = cafePost?.topComments as { content: string }[] | null
  // wave 번호 기반 인덱스 분산 — wave1~4가 서로 다른 원본 댓글 참조
  const len = topComments?.length ?? 0
  const idx = len > 0 ? ((waveNum - 1) * Math.ceil(len / 4)) % len : 0
  const refComment = len > 0 ? topComments![idx]?.content : undefined

  // Claude Haiku로 댓글 생성 (wave별 유형 강제)
  const commentText = await generateComment(post.title, waveNum, refComment)

  // 댓글 DB 저장 + Post.commentCount 동기화 (목록 표시 정확도)
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
      data: { commentCount: { increment: 1 } },
    }),
  ])

  // wave 완료 마킹
  const doneField = `wave${waveNum}Done` as WaveDoneKey
  await prisma.commentWaveQueue.update({
    where: { id: queue.id },
    data: { [doneField]: true },
  })

  console.log(`[WaveProcessor] wave${waveNum} 완료: postId=${queue.postId}, persona=${personaId}`)
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
      select: { id: true, postId: true, cafePostId: true, authorPersonaId: true },
      take: 10,
    })

    for (const queue of pending) {
      try {
        await processWave(queue, waveNum)
        processed++
      } catch (err) {
        failed++
        console.error(`[WaveProcessor] wave${waveNum} 오류 (id=${queue.id}):`, err)
        await sendSlackMessage('QA', `[WaveProcessor] wave${waveNum} 오류 (id=${queue.id}): ${String(err).slice(0, 100)}`)
      }
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
