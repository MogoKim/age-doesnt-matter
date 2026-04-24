import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CMO Content Gap Finder -- 주간 콘텐츠 갭 분석
 * 5개 페르소나 니즈 vs 현재 콘텐츠 갭 파악
 *
 * 흐름:
 * 1. 지난 7일간 카테고리/보드별 게시글 수 집계
 * 2. 5개 페르소나 니즈와 비교
 * 3. AI로 갭 분석 + 콘텐츠 추천
 * 4. Slack #에이전트-회의실 리포트 + BotLog
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

// -- 5개 페르소나 니즈 정의 --

const PERSONA_NEEDS: Record<string, { name: string; description: string; keywords: string[] }> = {
  P1: {
    name: '영숙씨 (58세, 은퇴 준비)',
    description: '은퇴 후 새 일자리, 재취업, 자격증, 창업 정보에 관심',
    keywords: ['일자리', '취업', '자격증', '창업', '재취업', '은퇴'],
  },
  P2: {
    name: '정희씨 (62세, 건강 불안)',
    description: '갱년기, 만성질환, 건강 관리, 운동, 식단 정보 필요',
    keywords: ['건강', '갱년기', '혈압', '당뇨', '관절', '수면', '운동'],
  },
  P3: {
    name: '미영씨 (55세, 활력 충전)',
    description: '유머, 재미, 일상 공유, 밝은 에너지 콘텐츠 선호',
    keywords: ['유머', '웃음', '취미', '여행', '맛집'],
  },
  P4: {
    name: '순자씨 (65세, 소통 갈증)',
    description: '외로움 해소, 또래 소통, 수다, 사는 이야기 공유',
    keywords: ['일상', '수다', '이야기', '고민', '부부', '자녀', '손주'],
  },
  P5: {
    name: '현주씨 (60세, 돌봄 고민)',
    description: '간병, 돌봄, 요양, 치매 관련 실용 정보 필요',
    keywords: ['간병', '돌봄', '치매', '요양', '간호', '수발'],
  },
}

// -- 카테고리/보드별 게시글 집계 --

interface BoardCount {
  boardType: string
  category: string | null
  count: number
}

async function getWeeklyPostCounts(): Promise<BoardCount[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: sevenDaysAgo },
    },
    select: {
      boardType: true,
      category: true,
    },
  })

  // 보드 + 카테고리별 집계
  const countMap = new Map<string, BoardCount>()
  for (const p of posts) {
    const key = `${p.boardType}::${p.category ?? '(없음)'}`
    const existing = countMap.get(key)
    if (existing) {
      existing.count++
    } else {
      countMap.set(key, { boardType: p.boardType, category: p.category, count: 1 })
    }
  }

  return Array.from(countMap.values()).sort((a, b) => b.count - a.count)
}

// -- CafePost 트렌드 확인 (어떤 주제가 뜨는지) --

async function getRecentCafeTrends(): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const cafePosts = await prisma.cafePost.findMany({
    where: { crawledAt: { gte: sevenDaysAgo } },
    select: { topics: true },
    take: 200,
  })

  const topicCount = new Map<string, number>()
  for (const cp of cafePosts) {
    for (const topic of cp.topics) {
      topicCount.set(topic, (topicCount.get(topic) ?? 0) + 1)
    }
  }

  return Array.from(topicCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([topic, count]) => `${topic} (${count}건)`)
    .join(', ')
}

// -- AI 갭 분석 --

async function analyzeGaps(
  boardCounts: BoardCount[],
  cafeTrends: string,
): Promise<string> {
  const countsText = boardCounts.length > 0
    ? boardCounts.map((bc) => `- ${bc.boardType}${bc.category ? ` / ${bc.category}` : ''}: ${bc.count}건`).join('\n')
    : '(게시글 없음)'

  const personaText = Object.entries(PERSONA_NEEDS)
    .map(([id, p]) => `- ${id} ${p.name}: ${p.description} [키워드: ${p.keywords.join(', ')}]`)
    .join('\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `당신은 50대 60대를 위한 커뮤니티 "우리 나이가 어때서"의 콘텐츠 전략가입니다.
콘텐츠 갭을 분석하고 구체적인 콘텐츠 제안을 합니다.

절대 규칙:
- "시니어", "액티브 시니어" 절대 사용 금지
- 구체적이고 실행 가능한 제안만
- 우선순위 명확히`,
    messages: [
      {
        role: 'user',
        content: `아래 데이터를 분석해서 콘텐츠 갭을 찾고, 다음 주 콘텐츠 우선순위를 제안해주세요.

[지난 7일 게시글 현황]
${countsText}

[카페 트렌드 키워드 TOP 15]
${cafeTrends || '(데이터 없음)'}

[5개 타겟 페르소나]
${personaText}

분석해주세요:
1. 어떤 페르소나가 가장 콘텐츠 부족한가?
2. 카페 트렌드 중 우리 커뮤니티에 없는 주제는?
3. 다음 주 우선 제작할 콘텐츠 5개 (보드, 카테고리, 제목 초안, 타겟 페르소나)

Markdown 형식으로 간결하게 응답해주세요.`,
      },
    ],
  })

  return response.content[0].type === 'text' ? response.content[0].text : '(분석 실패)'
}

// -- 메인 실행 --

async function main() {
  console.log('[ContentGapFinder] 시작')
  const startTime = Date.now()

  // 1. 데이터 수집
  const [boardCounts, cafeTrends] = await Promise.all([
    getWeeklyPostCounts(),
    getRecentCafeTrends(),
  ])

  const totalPosts = boardCounts.reduce((sum, bc) => sum + bc.count, 0)
  console.log(`[ContentGapFinder] 지난 7일 게시글: ${totalPosts}건, ${boardCounts.length}개 카테고리`)

  // 2. AI 갭 분석
  const analysis = await analyzeGaps(boardCounts, cafeTrends)
  console.log('[ContentGapFinder] 갭 분석 완료')

  // 3. Slack #에이전트-회의실 리포트
  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: '주간 콘텐츠 갭 분석 리포트',
    body: `*지난 7일 게시글*: ${totalPosts}건\n\n${analysis.slice(0, 2500)}`,
  })

  // 4. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CONTENT_GAP_ANALYSIS',
      status: 'SUCCESS',
      details: JSON.stringify({
        totalPosts,
        boardCounts: boardCounts.slice(0, 10),
        analysisPreview: analysis.slice(0, 500),
      }),
      itemCount: boardCounts.length,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[ContentGapFinder] 완료 -- ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[ContentGapFinder] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '콘텐츠 갭 분석 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
