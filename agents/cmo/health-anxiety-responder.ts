import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

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

async function ensureBotUser(): Promise<string> {
  const email = 'bot-health@unao.bot'
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      nickname: '건강길잡이',
      providerId: `bot-health-${Date.now()}`,
      role: 'USER',
      grade: 'WARM_NEIGHBOR',
    },
  })
  return user.id
}

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
    system: `당신은 50대 60대를 위한 커뮤니티 "우리 나이가 어때서"의 건강 콘텐츠 전문가입니다.

절대 규칙:
- "시니어", "액티브 시니어" 절대 사용 금지. "우리 또래", "50대 60대", "인생 2막" 등 사용
- 의학적 진단/처방 절대 금지. "전문의 상담을 권합니다" 반드시 포함
- 공감 먼저, 정보는 그 다음. "걱정되시죠? 저도 그랬어요" 같은 톤
- Q&A 형식: 질문(우리 또래가 실제 궁금해할 것) + 답변(따뜻하고 실용적)
- HTML 형식 (<p>, <h3>, <strong>, <ul>, <li> 태그 사용)
- 총 3-5개 Q&A 포함`,
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
  const botUserId = await ensureBotUser()
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
