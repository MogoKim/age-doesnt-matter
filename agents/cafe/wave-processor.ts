// LOCAL ONLY (GHA) — Comment Wave 파동 처리 (wave1~4 순차 댓글 게시)
/**
 * 댓글 파동 프로세서
 * CommentWaveQueue에서 pending 항목을 찾아 댓글을 게시하고 done 처리.
 * GHA cron `*\/5 * * * *` 으로 실행 (wave1: +1분, wave2: +5분, wave3: +30분, wave4: +60분)
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { getBotUser } from '../seed/generator.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

// 큐레이션 페르소나 (글쓴이 제외 후 랜덤 선택)
const COMMENTER_PERSONA_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
]

type WaveNum = 1 | 2 | 3 | 4
type WaveDoneKey = 'wave1Done' | 'wave2Done' | 'wave3Done' | 'wave4Done'
type WaveAtKey = 'wave1At' | 'wave2At' | 'wave3At' | 'wave4At'

async function generateComment(postTitle: string, refComment?: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: `50-60대 여성 커뮤니티 회원으로서 아래 글에 짧은 공감 댓글을 써주세요.
글 제목: "${postTitle}"
${refComment ? `참고 어조: "${refComment.slice(0, 80)}"` : ''}

규칙:
- 40~80자 이내, 순수 텍스트만
- 마크다운/이모지 금지
- 자연스러운 구어체 (경어 또는 반말)
- 공감, 응원, 질문 중 하나

댓글:`,
    }],
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
  const refComment = topComments?.[Math.floor(Math.random() * (topComments?.length ?? 0))]?.content

  // Claude Haiku로 댓글 생성
  const commentText = await generateComment(post.title, refComment)

  // 댓글 DB 저장
  await prisma.comment.create({
    data: {
      postId: queue.postId,
      authorId: userId,
      content: commentText,
      status: 'ACTIVE',
    },
  })

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
        console.error(`[WaveProcessor] wave${waveNum} 오류 (id=${queue.id}):`, err)
      }
    }
  }

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'WAVE_PROCESS',
      status: 'SUCCESS',
      details: JSON.stringify({ processed }),
      itemCount: processed,
    },
  })

  await disconnect()
  console.log(`[WaveProcessor] 완료 — ${processed}건 처리`)
}

if (process.argv[1]?.endsWith('wave-processor.ts') || process.argv[1]?.endsWith('wave-processor.js')) {
  main().catch(async (err) => {
    console.error('[WaveProcessor] 오류:', err)
    await disconnect()
    process.exit(1)
  })
}
