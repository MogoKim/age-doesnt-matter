import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { ensureBotUser } from '../core/bot-user.js'

/**
 * CMO Health Anxiety Responder -- P2 정희씨 타겟
 * 건강불안 해소 Q&A 에이전트
 *
 * 흐름:
 * 1. CafePost에서 건강 관련 토픽/키워드 포함 글 수집
 * 2. 상위 5개 건강 고민/질문 추출
 * 3. AI로 공감형 Q&A 매거진 기사 생성
 * 4. Post(MAGAZINE, 건강) 저장 + BotLog + Slack 알림
 */

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()

const HEALTH_KEYWORDS = ['건강', '갱년기', '혈압', '당뇨', '관절', '수면', '불면']

// -- 봇 유저 조회/생성 --


// -- CafePost에서 건강 관련 글 수집 --

async function fetchHealthPosts() {
  return prisma.cafePost.findMany({
    where: {
      OR: [
        // topics 배열에 건강 키워드가 있는 글
        ...HEALTH_KEYWORDS.map((kw) => ({ topics: { has: kw } })),
        // title/content에 키워드 포함
        ...HEALTH_KEYWORDS.flatMap((kw) => [
          { title: { contains: kw } },
          { content: { contains: kw } },
        ]),
      ],
    },
    orderBy: { qualityScore: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      content: true,
      topics: true,
      qualityScore: true,
      cafeName: true,
    },
  })
}

// -- AI Q&A 기사 생성 --

async function generateHealthQA(
  posts: Awaited<ReturnType<typeof fetchHealthPosts>>,
): Promise<{ title: string; content: string; summary: string }> {
  const concerns = posts
    .map((p, i) => `${i + 1}. [${p.cafeName}] ${p.title}\n토픽: ${p.topics.join(', ')}\n내용: ${p.content.slice(0, 400)}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3072,
    system: `당신은 63세 "정희씨"입니다. 갱년기 이후 건강 걱정이 생긴 뒤부터 비슷한 또래 분들 걱정에 마음이 먼저 가는 분이에요.

[쓰는 방식]
- 공감이 먼저예요. "저도 그 나이에 그랬어요"로 시작해도 좋아요
- 간단하고 솔직하게. 의학 용어 쓰지 않아요
- 본인 경험을 자연스럽게 섞어요 ("저는 그때 ~했더니...")
- 마지막엔 "한번 가보시는 게 마음 편하실 것 같아요" 식으로 자연스럽게 권유
- Q&A 형식: 질문(우리 또래가 실제 궁금해할 것) + 답변 3-5개
- HTML 형식 (<p>, <h3>, <strong>, <ul>, <li> 태그 사용)

[이렇게 써요 — 예시]
"아 이거 저도 진짜 많이 걱정했는데요. 갱년기 끝나고 나서 갑자기 여기저기가 더 신경 쓰이더라고요."
"병원 가봤더니 별거 아니래요. 그냥 나이 드는 거래요 ㅠ 그래도 알고 나니까 마음이 편했어요~"
"저는 그냥 동네 내과 먼저 갔어요. 거기서 괜찮다고 하면 일단 믿어보는 편이에요."

[절대 쓰지 않아요]
- "의학적으로 말씀드리면", "전문적인 정보를 제공해 드립니다"
- "1. 증상 파악 2. 원인 분석 3. 대처법" 같은 강의 구조
- 5가지 이상 목록 나열
- "~합니다", "~드립니다"
- "안녕하세요"로 시작
- "시니어", "액티브 시니어" 절대 사용 금지`,
    messages: [
      {
        role: 'user',
        content: `아래 카페 글들에서 50대 60대가 가장 걱정하는 건강 주제를 파악하고,
공감형 Q&A 매거진 기사를 작성해주세요.

[수집된 건강 관련 글]
${concerns}

응답 형식 (JSON):
{
  "title": "매거진 제목 (공감 유발, 30자 이내)",
  "content": "HTML Q&A 본문 (1000-2000자)",
  "summary": "요약 (100자 이내)"
}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : '{}') as {
      title: string
      content: string
      summary: string
    }
  } catch {
    return {
      title: '우리 또래 건강 고민, 함께 나눠요',
      content: `<p>${text.slice(0, 1500)}</p>`,
      summary: '50대 60대가 궁금해하는 건강 Q&A를 모았습니다.',
    }
  }
}

// -- 메인 실행 --

async function main() {
  console.log('[HealthAnxietyResponder] 시작')
  const startTime = Date.now()

  // 1. 건강 관련 CafePost 수집
  const posts = await fetchHealthPosts()
  console.log(`[HealthAnxietyResponder] ${posts.length}건 수집`)

  if (posts.length === 0) {
    console.log('[HealthAnxietyResponder] 건강 관련 글 없음 -- 스킵')
    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'HEALTH_ANXIETY_RESPOND',
        status: 'PARTIAL',
        details: JSON.stringify({ reason: '건강 관련 CafePost 없음' }),
        itemCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    })
    await disconnect()
    return
  }

  // 2. AI Q&A 기사 생성
  const article = await generateHealthQA(posts)
  console.log(`[HealthAnxietyResponder] Q&A 생성: ${article.title}`)

  // 3. Post 저장
  const botUserId = await ensureBotUser('bot-health@unao.bot', '건강길잡이', 'bot-health')
  const post = await prisma.post.create({
    data: {
      title: article.title,
      content: article.content,
      summary: article.summary,
      boardType: 'MAGAZINE',
      category: '건강',
      authorId: botUserId,
      source: 'BOT',
      status: 'PUBLISHED',
    },
  })
  console.log(`[HealthAnxietyResponder] Post 저장: ${post.id}`)

  // 4. Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: '건강 Q&A 매거진 발행',
    body: `*${article.title}*\n참고 글 ${posts.length}건 기반\nPost ID: ${post.id}`,
  })

  // 5. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'HEALTH_ANXIETY_RESPOND',
      status: 'SUCCESS',
      details: JSON.stringify({
        postId: post.id,
        sourcePostCount: posts.length,
        title: article.title,
      }),
      itemCount: 1,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[HealthAnxietyResponder] 완료 -- ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[HealthAnxietyResponder] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '건강 Q&A 매거진 생성 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
