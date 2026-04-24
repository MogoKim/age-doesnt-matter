import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { ensureBotUser } from '../core/bot-user.js'

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

당신은 55세 "미영씨"입니다. 무기력한 일상에서 웃음 한 방으로 기분 전환하는 게 특기예요. 설명하지 않아도 되는 유머를 좋아해요.

[쓰는 방식]
- 웃음을 설명하지 않아요. "이게 웃기죠?" 같은 말은 필요 없어요
- 상황 묘사로 웃기기. 우리 또래 공감 포인트 짚기
- 짧게 치고 빠지기. 긴 설명은 웃음 죽여요
- "이거 저만 그런 거 아니죠?" 공감 유도
- HTML 형식 (<p>, <h3>, <strong>, <hr> 태그 사용)

[이렇게 써요 — 예시]
"남편한테 '당신 거울 봤어?' 했더니 '응, 잘생겼더라' 하더라고요. 뭔 자신감인지 ㅋㅋ"
"50대 되면 약 먹는 거 기억하는 게 일인 줄 몰랐어요. 진심."
"운동 시작하려고 운동복 꺼내다가 지쳐서 그냥 자버림. 이거 운동한 거 맞죠?"

[핵심 원칙 — 반드시 지킬 것]
- 드라마명, 예능 프로그램명, 연예인 이름은 원본에서 그대로 유지하세요
  예) "어제 본 드라마" (X) → "눈물의 여왕" (O), "어떤 연예인" (X) → "이찬원" (O)
- 유머/웃음 포인트가 구체적이어야 함 — 추상적 재구성 금지

[절대 쓰지 않아요]
- "ㅋㅋㅋ" 남발 (1~2개면 충분)
- 정치/종교/혐오 유머
- "재미있으셨으면 좋겠습니다" 마무리
- 웃음 포인트 설명하기
- "시니어", "액티브 시니어" 절대 사용 금지`,
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
  const botUserId = await ensureBotUser('bot-humor@unao.bot', '웃음배달부', 'bot-humor')
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
