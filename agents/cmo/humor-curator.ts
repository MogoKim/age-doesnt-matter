import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CMO Humor Curator -- P3 미영씨 타겟
 * 유머/웃음 큐레이션 에이전트
 *
 * 흐름:
 * 1. CafePost에서 유머/웃음 카테고리 + 높은 참여도 글 수집
 * 2. 상위 5개 유머 글 선정
 * 3. AI로 "오늘의 웃음 모음" 포스트 생성
 * 4. Post(HUMOR) 저장 + BotLog + Slack 알림
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

/** KST 현재 날짜/요일/시간대 (GitHub Actions UTC 보정) */
function getKstContext(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const day = days[kst.getUTCDay()]
  const hour = kst.getUTCHours()
  const timeSlot = hour < 6 ? '새벽' : hour < 12 ? '오전' : hour < 18 ? '오후' : '저녁'
  return `[KST 현재] ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${day} ${timeSlot}\n글에서 날짜/요일/시간대를 언급할 때 반드시 위 기준으로 쓰세요.`
}

// -- 봇 유저 조회/생성 --

async function ensureBotUser(): Promise<string> {
  const email = 'bot-humor@unao.bot'
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      nickname: '웃음배달부',
      providerId: `bot-humor-${Date.now()}`,
      role: 'USER',
      grade: 'WARM_NEIGHBOR',
    },
  })
  return user.id
}

// -- CafePost에서 유머 글 수집 --

async function fetchHumorPosts() {
  return prisma.cafePost.findMany({
    where: {
      OR: [
        // 필수: 유머 명시 글
        { category: { contains: '유머' } },
        { boardName: { contains: '유머' } },
        { boardCategory: { equals: 'humor' } },
        { topics: { hasSome: ['유머', '웃음', '개그', '웃긴'] } },
        { title: { contains: 'ㅋㅋ' } },
        // 추가: 엔터테인먼트 공감 글 (드라마/예능/연예인명 포함)
        { desireCategory: { equals: 'ENTERTAIN' } },
        { topics: { hasSome: ['드라마', '예능', '연예인', '트로트', '임영웅', '넷플릭스', '방송'] } },
      ],
    },
    orderBy: [
      { likeCount: 'desc' },
      { commentCount: 'desc' },
    ],
    take: 8,
    select: {
      id: true,
      title: true,
      content: true,
      likeCount: true,
      commentCount: true,
      cafeName: true,
      desireCategory: true,
    },
  })
}

// -- AI 웃음 모음 생성 --

async function generateHumorPost(
  posts: Awaited<ReturnType<typeof fetchHumorPosts>>,
): Promise<{ title: string; content: string; summary: string }> {
  // 상위 5개 소스 글 선택 (유머 + 엔터 혼합)
  const sourcePosts = posts.slice(0, 5)

  const humorSources = sourcePosts
    .map((p, i) => `${i + 1}. [${p.cafeName}] ${p.title}\n공감 ${p.likeCount} | 댓글 ${p.commentCount}\n${p.content.slice(0, 500)}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `${getKstContext()}

당신은 50대 60대를 위한 커뮤니티 "우리 나이가 어때서"의 유머 큐레이터입니다.

[절대 규칙]
- "시니어", "액티브 시니어" 절대 사용 금지. "우리 또래", "50대 60대" 등 사용
- 밝고 유쾌한 톤. 세대 공감 유머 중심
- 정치/종교/혐오 유머 절대 금지
- "ㅋㅋ" 남발 금지, 위트 있게
- HTML 형식 (<p>, <h3>, <strong>, <hr> 태그 사용)

[핵심 원칙 — 반드시 지킬 것]
- 드라마명, 예능 프로그램명, 연예인 이름은 원본에서 그대로 유지하세요
  예) "어제 본 드라마" (X) → "눈물의 여왕" (O), "어떤 연예인" (X) → "이찬원" (O)
- 잘 모르는 프로그램이라도 이름은 정확히 표기
- 유머/웃음 포인트가 구체적이어야 함 — 추상적 재구성 금지`,
    messages: [
      {
        role: 'user',
        content: `아래 인기 글들을 참고해서 "오늘의 웃음 모음" 포스트를 만들어주세요.
글의 구체적 소재(프로그램명, 연예인명, 상황)는 그대로 살리고, 재미있게 엮어서 구성하세요.

[인기 글 모음]
${humorSources}

응답 형식 (JSON):
{
  "title": "포스트 제목 (재미있고 클릭 유발, 25자 이내)",
  "content": "HTML 본문 (500-1000자, 3-5개 유머/공감 모음, 각 항목에 실제 프로그램명/상황 포함)",
  "summary": "요약 (80자 이내)"
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
      title: '오늘의 웃음 한 스푼',
      content: `<p>${text.slice(0, 800)}</p>`,
      summary: '우리 또래 웃음 모음을 준비했습니다.',
    }
  }
}

// -- 메인 실행 --

async function main() {
  console.log('[HumorCurator] 시작')
  const startTime = Date.now()

  // 1. 유머 CafePost 수집
  const posts = await fetchHumorPosts()
  console.log(`[HumorCurator] ${posts.length}건 수집`)

  if (posts.length === 0) {
    console.log('[HumorCurator] 유머 글 없음 -- 스킵')
    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'HUMOR_CURATE',
        status: 'PARTIAL',
        details: JSON.stringify({ reason: '유머 관련 CafePost 없음' }),
        itemCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    })
    await disconnect()
    return
  }

  // 2. AI 유머 모음 생성
  const humor = await generateHumorPost(posts)
  console.log(`[HumorCurator] 유머 모음 생성: ${humor.title}`)

  // 3. Post 저장
  const botUserId = await ensureBotUser()
  const post = await prisma.post.create({
    data: {
      title: humor.title,
      content: humor.content,
      summary: humor.summary,
      boardType: 'HUMOR',
      authorId: botUserId,
      source: 'BOT',
      status: 'PUBLISHED',
    },
  })
  console.log(`[HumorCurator] Post 저장: ${post.id}`)

  // 4. Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: '오늘의 웃음 모음 발행',
    body: `*${humor.title}*\n참고 글 ${posts.length}건 기반\nPost ID: ${post.id}`,
  })

  // 5. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'HUMOR_CURATE',
      status: 'SUCCESS',
      details: JSON.stringify({
        postId: post.id,
        sourcePostCount: posts.length,
        title: humor.title,
      }),
      itemCount: 1,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[HumorCurator] 완료 -- ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[HumorCurator] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '유머 큐레이션 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
