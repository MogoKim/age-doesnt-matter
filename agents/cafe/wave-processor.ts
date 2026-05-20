// GHA ONLY — agents-cafe-wave.yml */5 cron으로 실행, Comment Wave 파동 처리 (wave1~4 순차 댓글 게시)
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
  1: '공감형 — 글쓴이의 감정이나 상황에 공감하는 1~2문장. "저도 그런 적 있어요"류. 응원 문구("화이팅") 금지.',
  2: '질문형 — 글에서 궁금한 점 한 가지를 구체적으로 질문. "혹시 ~어떻게 하셨어요?"류. 공감 선언 없이 바로 질문으로 시작.',
  3: '경험공유형 — 본인의 실제 경험을 2~3문장으로 구체적으로 공유. 수치/장소/기간 등 디테일 포함. "저는 ~했는데 ~하더라고요" 구조.',
  4: '다른관점형 — 글과 다른 각도에서 바라본 생각 또는 보완 정보. "저는 반대로 ~", "그런데 ~도 있더라고요"류. 응원/화이팅 절대 금지.',
}

// viralType별 wave 댓글 유형 리매핑 — 글의 감정 구조에 맞게 첫 댓글 유형을 동적으로 조정
// BETRAYAL(배신): 배신감 글은 다른관점으로 시작할 때 공감대 더 높음
// INJUSTICE(억울함): 억울한 글은 질문으로 시작해 사연을 더 풀어내도록 유도
// CONTROVERSY(논쟁): 논란글은 질문 → 다른관점 순으로 균형 있게
// REVERSAL(반전): 반전글은 경험공유로 시작해 "나도 당했어" 공감 유도
// EMPATHY(공감): 공감 글은 공감 → 경험 순서 유지 (기본값과 유사)
function remapWaveType(waveNum: WaveNum, viralType: string | null | undefined): WaveNum {
  if (!viralType) return waveNum
  const ORDER_MAP: Partial<Record<string, WaveNum[]>> = {
    BETRAYAL:    [4, 1, 3, 2],
    INJUSTICE:   [2, 4, 1, 3],
    CONTROVERSY: [2, 4, 3, 1],
    REVERSAL:    [3, 1, 2, 4],
    EMPATHY:     [1, 3, 2, 4],
  }
  const order = ORDER_MAP[viralType]
  return order ? order[waveNum - 1] : waveNum
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
- "화이팅", "응원합니다", "좋은 정보 감사합니다" 등 응원·감사 문구 금지
- 접두사 없이 댓글 내용만 출력

댓글:`
    : `50-60대 여성 커뮤니티 회원으로서 아래 글에 짧은 댓글을 써주세요.
글 제목: "${postTitle}"

규칙:
- 댓글 유형: ${waveType}
- 40~80자 이내, 순수 텍스트만
- 마크다운/이모지 금지
- "화이팅", "응원합니다", "좋은 정보 감사합니다" 등 응원·감사 문구 금지
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

// 작성자가 첫 번째 봇 댓글에 대댓글 달 때 사용할 원문 없을 경우 풀
const AUTHOR_REPLY_POOL = [
  '공감해 주셔서 감사해요~',
  '맞아요 저도 그렇게 생각해요 ^^',
  '좋은 말씀 감사합니다',
  '그러게요 저도 비슷한 경험이 있어요',
  '이렇게 공감해 주시니 힘이 나요',
  '맞아요 맞아요 ^^',
  '함께 나눠 주셔서 감사해요',
]

async function processAuthorReply(
  queue: { id: string; postId: string; cafePostId: string; authorPersonaId: string }
) {
  const authorUserId = await getBotUser(queue.authorPersonaId)
  if (!authorUserId) return

  // 작성자가 아닌 봇의 첫 번째 일반 댓글 (대댓글 달 대상)
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

  // 원본 카페글 replies에서 작성자 대댓글 원문 찾기
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
      data: { commentCount: { increment: 1 } },
    }),
  ])
  console.log(`[WaveProcessor] 작성자 대댓글 완료: postId=${queue.postId}, persona=${queue.authorPersonaId}`)
}

async function processWave(
  queue: { id: string; postId: string; cafePostId: string; authorPersonaId: string },
  waveNum: WaveNum,
) {
  // 봇 당일 댓글 수 집계 (cap 체크용 — P4)
  const todayCommentStart = new Date()
  todayCommentStart.setHours(0, 0, 0, 0)
  const BOT_DAILY_COMMENT_CAP = 3
  // groupBy에서 관계 필터 불가 → BOT 유저 ID 목록 먼저 조회 (email @unao.bot 기준)
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

  // 글쓴이 제외 후보 풀 셔플 후 당일 캡 미초과 봇 우선 선택
  const basePool = [...COMMENTER_PERSONA_IDS.filter(p => p !== queue.authorPersonaId)]
    .sort(() => Math.random() - 0.5)
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
  // fallback: 모두 캡 초과 시 첫 번째 후보
  if (!userId) {
    personaId = basePool[0]
    userId = await getBotUser(personaId)
  }
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

  // 봇 댓글 캡 체크 (≤5) — comment-activator·reply-chain과 합산
  const totalBotComments = await prisma.comment.count({
    where: {
      postId: queue.postId,
      author: { email: { endsWith: '@unao.bot' } },
      status: 'ACTIVE',
    },
  })
  if (totalBotComments >= 5) {
    const doneFieldCap = `wave${waveNum}Done` as WaveDoneKey
    await prisma.commentWaveQueue.update({ where: { id: queue.id }, data: { [doneFieldCap]: true } })
    console.warn(`[WaveProcessor] wave${waveNum}: 봇 댓글 캡 초과(${totalBotComments}건) — 스킵 (postId=${queue.postId})`)
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

  // 원본 카페글 topComments + viralType 참조
  const cafePost = await prisma.cafePost.findUnique({
    where: { id: queue.cafePostId },
    select: { topComments: true, viralType: true },
  })
  const topComments = cafePost?.topComments as { content: string }[] | null
  // wave 번호 기반 인덱스 분산 — wave1~4가 서로 다른 원본 댓글 참조
  const len = topComments?.length ?? 0
  const idx = len > 0 ? ((waveNum - 1) * Math.ceil(len / 4)) % len : 0
  const refComment = len > 0 ? topComments![idx]?.content : undefined

  // viralType에 따라 댓글 유형 리매핑 (null이면 기본 순서 유지)
  const effectiveWaveNum = remapWaveType(waveNum, cafePost?.viralType)

  // topComments 있으면 원문 그대로 달기, 없으면 AI fallback
  let commentText: string
  if (refComment && refComment.trim().length >= 10) {
    commentText = refComment.trim()
  } else {
    commentText = await generateComment(post.title, effectiveWaveNum, undefined)
  }

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

  // wave4 완료된 큐에서 작성자 대댓글 미처리 항목 처리
  const replyPending = await prisma.commentWaveQueue.findMany({
    where: { wave4Done: true, expiresAt: { gte: now } },
    select: { id: true, postId: true, cafePostId: true, authorPersonaId: true },
    take: 10,
  })
  for (const queue of replyPending) {
    const authorUserId = await getBotUser(queue.authorPersonaId)
    if (!authorUserId) continue
    const alreadyReplied = await prisma.comment.findFirst({
      where: { postId: queue.postId, authorId: authorUserId, parentId: { not: null } },
    })
    if (alreadyReplied) continue
    try {
      await processAuthorReply(queue)
      processed++
    } catch (err) {
      failed++
      console.error('[WaveProcessor] 작성자 대댓글 오류:', err)
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
