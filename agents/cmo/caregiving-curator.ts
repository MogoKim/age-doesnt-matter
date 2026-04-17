import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { ensureBotUser } from '../core/bot-user.js'

/**
 * CMO Caregiving Curator -- P5 현주씨 타겟
 * 간병/돌봄 정보 큐레이션 에이전트
 *
 * 흐름:
 * 1. CafePost에서 간병/돌봄 관련 키워드 포함 글 수집
 * 2. qualityScore >= 40 필터링, 상위 10개 선정
 * 3. AI로 큐레이션 다이제스트 생성
 * 4. Post(MAGAZINE, 간병) 저장 + BotLog + Slack 알림
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

const CAREGIVING_KEYWORDS = ['간병', '돌봄', '치매', '요양', '요양보호사', '간병인', '수발', '간호']

// -- 봇 유저 조회/생성 --


// -- CafePost에서 간병/돌봄 글 수집 --

async function fetchCaregivingPosts() {
  const allPosts = await prisma.cafePost.findMany({
    where: {
      qualityScore: { gte: 40 },
      OR: CAREGIVING_KEYWORDS.flatMap((kw) => [
        { title: { contains: kw } },
        { content: { contains: kw } },
      ]),
    },
    orderBy: { qualityScore: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      content: true,
      qualityScore: true,
      cafeName: true,
      postedAt: true,
    },
  })

  return allPosts
}

// -- AI 다이제스트 생성 --

async function generateDigest(
  posts: Awaited<ReturnType<typeof fetchCaregivingPosts>>,
): Promise<{ title: string; content: string; summary: string }> {
  const postSummaries = posts
    .map((p, i) => `${i + 1}. [${p.cafeName}] ${p.title}\n${p.content.slice(0, 300)}...`)
    .join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `당신은 50대 60대를 위한 커뮤니티 "우리 나이가 어때서"의 돌봄 정보 큐레이터입니다.

절대 규칙:
- "시니어", "액티브 시니어" 절대 사용 금지. "우리 또래", "50대 60대", "인생 2막" 등 사용
- 따뜻하고 공감하는 톤, 실용적 정보 중심
- HTML 형식으로 작성 (<p>, <h3>, <strong>, <ul>, <li> 태그 사용)`,
    messages: [
      {
        role: 'user',
        content: `아래 카페 글들을 분석해서 간병/돌봄 정보 큐레이션 매거진 기사를 작성해주세요.

[수집된 글]
${postSummaries}

응답 형식 (JSON):
{
  "title": "매거진 제목 (30자 이내, 공감 유발)",
  "content": "HTML 형식 본문 (800-1500자, 핵심 정보 + 실용 팁 + 따뜻한 응원)",
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
      title: '이번 주 돌봄 이야기 모음',
      content: `<p>${text.slice(0, 1000)}</p>`,
      summary: '간병/돌봄 관련 최신 정보를 모았습니다.',
    }
  }
}

// -- 메인 실행 --

async function main() {
  console.log('[CaregivingCurator] 시작')
  const startTime = Date.now()

  // 1. 간병/돌봄 관련 CafePost 수집
  const posts = await fetchCaregivingPosts()
  console.log(`[CaregivingCurator] ${posts.length}건 수집`)

  if (posts.length === 0) {
    console.log('[CaregivingCurator] 관련 글 없음 -- 스킵')
    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'CAREGIVING_CURATE',
        status: 'PARTIAL',
        details: JSON.stringify({ reason: '간병/돌봄 관련 CafePost 없음' }),
        itemCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    })
    await disconnect()
    return
  }

  // 2. AI 다이제스트 생성
  const digest = await generateDigest(posts)
  console.log(`[CaregivingCurator] 다이제스트 생성: ${digest.title}`)

  // 3. Post 저장
  const botUserId = await ensureBotUser()
  const post = await prisma.post.create({
    data: {
      title: digest.title,
      content: digest.content,
      summary: digest.summary,
      boardType: 'MAGAZINE',
      category: '간병',
      authorId: botUserId,
      source: 'BOT',
      status: 'PUBLISHED',
    },
  })
  console.log(`[CaregivingCurator] Post 저장: ${post.id}`)

  // 4. Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: '간병/돌봄 큐레이션 매거진 발행',
    body: `*${digest.title}*\n참고 글 ${posts.length}건 기반\nPost ID: ${post.id}`,
  })

  // 5. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CAREGIVING_CURATE',
      status: 'SUCCESS',
      details: JSON.stringify({
        postId: post.id,
        sourcePostCount: posts.length,
        title: digest.title,
      }),
      itemCount: 1,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[CaregivingCurator] 완료 -- ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[CaregivingCurator] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '간병/돌봄 큐레이션 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
