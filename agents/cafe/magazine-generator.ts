/**
 * 매거진 자동생성기
 * CafeTrend.magazineTopics를 기반으로 에디터 스타일 매거진 글 생성
 * 매일 16:00 KST 실행 (트렌드 분석 후)
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import type { MagazineSuggestion } from './types.js'
import { matchCpsProducts, saveCpsLinks } from './cps-matcher.js'

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()

/** 카테고리 자동 매핑 */
function detectCategory(title: string, reason: string): string {
  const text = `${title} ${reason}`.toLowerCase()
  const map: Record<string, string[]> = {
    '건강': ['건강', '운동', '관절', '영양', '수면', '병원', '치매', '혈압', '당뇨', '걷기'],
    '생활': ['살림', '정리', '세탁', '절약', '생활', '꿀팁', '재활용'],
    '재테크': ['재테크', '연금', '저축', '투자', '부동산', '노후', '보험'],
    '여행': ['여행', '맛집', '산책', '둘레길', '관광', '기차', '드라이브'],
    '문화': ['독서', '영화', '드라마', '음악', '전시', '공연', '문화'],
    '요리': ['요리', '레시피', '반찬', '김치', '밑반찬', '제철', '장보기'],
    '일자리': ['일자리', '취업', '자격증', '봉사', '은퇴', '창업', '알바'],
  }

  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some(kw => text.includes(kw))) return cat
  }
  return '생활'
}

/** 최근 매거진과 주제 중복 체크 */
async function getRecentMagazineTitles(days: number): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const recent = await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      status: 'PUBLISHED',
      createdAt: { gte: since },
    },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return recent.map(p => p.title)
}

/** 카페 참고글 가져오기 */
async function getReferencePosts(topic: MagazineSuggestion) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)

  return prisma.cafePost.findMany({
    where: {
      isUsable: true,
      crawledAt: { gte: yesterday },
      OR: [
        { title: { contains: topic.title.split(' ')[0], mode: 'insensitive' } },
        ...(topic.relatedPosts.length > 0
          ? [{ title: { in: topic.relatedPosts } }]
          : []),
      ],
    },
    orderBy: { likeCount: 'desc' },
    take: 5,
    select: { title: true, content: true, cafeName: true, likeCount: true },
  })
}

/** 매거진 글 생성 (Sonnet 사용) */
async function generateMagazineArticle(
  topic: MagazineSuggestion,
  category: string,
  referencePosts: { title: string; content: string; cafeName: string }[],
  recentTitles: string[],
): Promise<{ title: string; content: string; summary: string } | null> {
  const refs = referencePosts.map((p, i) =>
    `[${i + 1}] (${p.cafeName}) "${p.title}"\n${p.content.slice(0, 300)}`,
  ).join('\n\n')

  const recentList = recentTitles.slice(0, 10).map(t => `- ${t}`).join('\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `당신은 "우리 나이가 어때서" 커뮤니티의 매거진 에디터입니다.
50~60대 독자를 위한 따뜻하고 유익한 매거진 기사를 작성합니다.

작성 규칙:
- "시니어", "액티브 시니어" 같은 표현 절대 금지
- 편안한 존댓말 (해요체)
- 실용적이고 바로 써먹을 수 있는 정보 중심
- 공감할 수 있는 에피소드 포함
- HTML 형식으로 작성 (h2, h3, p, ul, li, strong 태그 사용)
- 정치/종교/혐오/광고 절대 금지`,
    messages: [{
      role: 'user',
      content: `"${topic.title}" 주제로 매거진 기사를 작성해주세요.
카테고리: ${category}
추천 이유: ${topic.reason}

${refs ? `참고 자료 (카페 인기글):\n${refs}` : ''}

${recentList ? `최근 발행 매거진 (중복 주제 피해주세요):\n${recentList}` : ''}

응답 형식:
제목: (20~40자, 매력적이고 클릭하고 싶은 제목)
요약: (50~80자, 한 줄 요약)
본문: (HTML, 600~1200자, 소제목 2~3개 포함)

본문 구조 예시:
<h2>소제목</h2>
<p>내용...</p>
<h3>팁/포인트</h3>
<ul><li>항목</li></ul>`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const summaryMatch = text.match(/요약:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  if (!titleMatch || !bodyMatch) return null

  return {
    title: titleMatch[1].trim(),
    summary: summaryMatch?.[1]?.trim() ?? '',
    content: bodyMatch[1].trim(),
  }
}

/** 매거진 게시 (에디터 봇 계정 사용) */
async function publishMagazine(
  article: { title: string; content: string; summary: string },
  category: string,
): Promise<string> {
  // 매거진 전용 봇 — 페르소나 B(은퇴신사) 사용 (차분한 정보형)
  const editorUserId = await getBotUser('B')

  const post = await prisma.post.create({
    data: {
      title: article.title,
      content: article.content,
      summary: article.summary,
      boardType: 'MAGAZINE',
      category,
      authorId: editorUserId,
      source: 'BOT',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })

  return post.id
}

/** 메인 실행 */
async function main() {
  console.log('[MagazineGenerator] 시작')
  const startTime = Date.now()

  // 1) 오늘/어제 트렌드 분석 결과 조회
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let trend = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'daily' } },
  })

  // 오늘 없으면 어제 것 사용
  if (!trend) {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    trend = await prisma.cafeTrend.findUnique({
      where: { date_period: { date: yesterday, period: 'daily' } },
    })
  }

  if (!trend) {
    console.log('[MagazineGenerator] 트렌드 분석 없음 — 스킵')
    await disconnect()
    return
  }

  const magazineTopics = trend.magazineTopics as unknown as MagazineSuggestion[]
  if (!magazineTopics || magazineTopics.length === 0) {
    console.log('[MagazineGenerator] 매거진 추천 주제 없음 — 스킵')
    await disconnect()
    return
  }

  // 2) 최근 매거진 제목 (중복 방지)
  const recentTitles = await getRecentMagazineTitles(14)

  // 3) 상위 1~2개 주제로 매거진 생성
  const maxArticles = 2
  let publishedCount = 0
  const publishedTitles: string[] = []

  for (const topic of magazineTopics.slice(0, maxArticles)) {
    // 점수 7 이상만 발행
    if (topic.score < 7) {
      console.log(`[MagazineGenerator] "${topic.title}" (${topic.score}/10) — 점수 미달, 스킵`)
      continue
    }

    const category = detectCategory(topic.title, topic.reason)
    const refs = await getReferencePosts(topic)

    console.log(`[MagazineGenerator] 생성 중: "${topic.title}" [${category}] (참고글 ${refs.length}개)`)

    const article = await generateMagazineArticle(topic, category, refs, recentTitles)
    if (!article) {
      console.log(`[MagazineGenerator] "${topic.title}" — 생성 실패`)
      continue
    }

    const postId = await publishMagazine(article, category)

    // CPS 상품 매칭 + 저장
    try {
      const cpsProducts = await matchCpsProducts(category, article.title, article.content)
      if (cpsProducts.length > 0) {
        await saveCpsLinks(postId, cpsProducts)
        console.log(`[MagazineGenerator] CPS ${cpsProducts.length}개 매칭: ${cpsProducts.map(p => p.productName).join(', ')}`)
      }
    } catch (err) {
      console.warn('[MagazineGenerator] CPS 매칭 실패 (무시):', err)
    }

    publishedCount++
    publishedTitles.push(article.title)
    console.log(`[MagazineGenerator] 발행: "${article.title}" (${postId})`)
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'COO',
      action: 'MAGAZINE_GENERATE',
      status: publishedCount > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        topicsAvailable: magazineTopics.length,
        published: publishedCount,
        titles: publishedTitles,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  if (publishedCount > 0) {
    await notifySlack({
      level: 'info',
      agent: 'MAGAZINE_GENERATOR',
      title: '매거진 자동 발행',
      body: `${publishedCount}편 발행 완료\n${publishedTitles.map(t => `• ${t}`).join('\n')}`,
    })
  }

  console.log(`[MagazineGenerator] 완료 — ${publishedCount}편 발행, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[MagazineGenerator] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'MAGAZINE_GENERATOR',
    title: '매거진 생성 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
