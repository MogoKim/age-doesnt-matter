/**
 * 사용자 심층 분석 — "고객은 도대체 왜 우나어에 올까?"
 *
 * CafePost/CafeTrend/Post/User/EventLog 데이터를 종합하여
 * Claude Opus에 전략적 사용자 분석을 요청하고
 * 검증된 페르소나 + 미션/비전 권고안을 생성합니다.
 *
 * 실행: npx tsx strategist/user-deep-analysis.ts
 * 또는: gh workflow run agents-daily.yml -f agent=strategist -f task=user-deep-analysis
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack, sendSlackMessage } from '../core/notifier.js'
import type { StrategicAnalysis, CollectedData } from './types.js'

const MODEL = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const client = new Anthropic()

// ────────────────────────────────────────
// 1. 데이터 수집
// ────────────────────────────────────────

async function collectData(): Promise<CollectedData> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // 배치 A: CafePost 콘텐츠 분석
  const [cafeCategoryStats, topQualityPosts, topEngagementPosts, cafeSentimentRaw] = await Promise.all([
    prisma.cafePost.groupBy({
      by: ['boardCategory'],
      _count: { id: true },
      _avg: { qualityScore: true, likeCount: true, commentCount: true },
      where: { boardCategory: { not: null } },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.cafePost.findMany({
      where: { qualityScore: { gte: 60 } },
      orderBy: { qualityScore: 'desc' },
      take: 200,
      select: {
        title: true, content: true, boardCategory: true,
        qualityScore: true, likeCount: true, commentCount: true, cafeName: true,
      },
    }),
    prisma.cafePost.findMany({
      orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }],
      take: 50,
      select: {
        title: true, boardCategory: true, likeCount: true,
        commentCount: true, viewCount: true, cafeName: true,
      },
    }),
    prisma.cafePost.groupBy({
      by: ['boardCategory', 'sentiment'],
      _count: { id: true },
      where: { boardCategory: { not: null }, sentiment: { not: null } },
    }),
  ])

  // 배치 B: CafeTrend 트렌드 패턴
  const recentTrends = await prisma.cafeTrend.findMany({
    where: { date: { gte: thirtyDaysAgo } },
    orderBy: { date: 'desc' },
    take: 30,
    select: {
      date: true, hotTopics: true, keywords: true,
      personaHints: true, magazineTopics: true,
    },
  })

  // 배치 C: 플랫폼 Post 참여도
  const [postEngagement, topTrendingPosts, postBySource] = await Promise.all([
    prisma.post.groupBy({
      by: ['boardType'],
      _count: { id: true },
      _avg: { viewCount: true, likeCount: true, commentCount: true, scrapCount: true },
      where: { status: 'PUBLISHED' },
    }),
    prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { trendingScore: 'desc' },
      take: 30,
      select: {
        title: true, boardType: true, category: true, trendingScore: true,
        viewCount: true, likeCount: true, commentCount: true, source: true,
      },
    }),
    prisma.post.groupBy({
      by: ['source'],
      _count: { id: true },
      _avg: { viewCount: true, likeCount: true },
      where: { status: 'PUBLISHED' },
    }),
  ])

  // 배치 D: 사용자 인구통계
  const [birthYearDist, genderDist, gradeDist, totalUsers] = await Promise.all([
    prisma.user.groupBy({
      by: ['birthYear'],
      _count: { id: true },
      where: { status: 'ACTIVE', birthYear: { not: null } },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.user.groupBy({
      by: ['gender'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
    }),
    prisma.user.groupBy({
      by: ['grade'],
      _count: { id: true },
      where: { status: 'ACTIVE' },
    }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
  ])

  // 배치 E: 검색어 & 페이지뷰 (EventLog)
  const [searchEvents, pageViewEvents] = await Promise.all([
    prisma.eventLog.findMany({
      where: { eventName: 'search', createdAt: { gte: thirtyDaysAgo } },
      select: { properties: true },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.eventLog.groupBy({
      by: ['path'],
      _count: { id: true },
      where: { eventName: 'page_view', createdAt: { gte: thirtyDaysAgo }, path: { not: null } },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    }),
  ])

  // 검색어 집계
  const searchMap = new Map<string, number>()
  for (const evt of searchEvents) {
    const props = evt.properties as Record<string, unknown> | null
    const query = typeof props?.query === 'string' ? props.query.trim().toLowerCase() : null
    if (query && query.length > 1) {
      searchMap.set(query, (searchMap.get(query) ?? 0) + 1)
    }
  }
  const searchTerms = [...searchMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([query, count]) => ({ query, count }))

  const topPages = (pageViewEvents as Array<{ path: string | null; _count: { id: number } }>).map(p => ({
    path: p.path!,
    count: p._count.id,
  }))

  // 배치 F: 시간 패턴 (JS에서 집계 — $queryRaw 타입 이슈 회피)
  const recentPosts = await (prisma as Record<string, unknown> & { post: { findMany: (args: Record<string, unknown>) => Promise<Array<{ createdAt: Date }>> } }).post.findMany({
    where: { status: 'PUBLISHED', createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
  })
  const hourMap = new Map<number, number>()
  const dowMap = new Map<number, number>()
  for (const p of recentPosts) {
    // KST = UTC+9
    const kst = new Date(p.createdAt.getTime() + 9 * 60 * 60 * 1000)
    const hour = kst.getUTCHours()
    const dow = kst.getUTCDay()
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1)
    dowMap.set(dow, (dowMap.get(dow) ?? 0) + 1)
  }
  const postsByHourRaw = [...hourMap.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count }))
  const postsByDowRaw = [...dowMap.entries()].sort((a, b) => a[0] - b[0]).map(([dow, count]) => ({ dow, count }))

  // 배치 G: SNS 성과
  const [socialPerformance, experimentLearnings] = await Promise.all([
    prisma.socialPost.groupBy({
      by: ['contentType'],
      _count: { id: true },
      where: { status: 'POSTED' },
    }),
    prisma.socialExperiment.findMany({
      where: { status: 'ANALYZED' },
      select: { hypothesis: true, variable: true, learnings: true, results: true },
      take: 20,
    }),
  ])

  // 타입 캐스트 — prisma가 Record<string, unknown>으로 타입되어 any 회피
  type GroupByResult = { boardCategory?: string | null; sentiment?: string | null; _count: { id: number }; _avg?: Record<string, number | null> }
  type PostGroupBy = { boardType: string; _count: { id: number }; _avg: Record<string, number | null> }
  type SourceGroupBy = { source: string; _count: { id: number }; _avg: Record<string, number | null> }
  type UserGroupBy = { birthYear?: number | null; gender?: string | null; grade?: string; _count: { id: number } }
  type SocialGroupBy = { contentType: string; _count: { id: number } }

  return {
    cafeCategoryStats: (cafeCategoryStats as GroupByResult[]).map((c: GroupByResult) => ({
      boardCategory: c.boardCategory ?? 'unknown',
      _count: c._count.id,
      _avg: {
        qualityScore: c._avg?.qualityScore ?? 0,
        likeCount: c._avg?.likeCount ?? 0,
        commentCount: c._avg?.commentCount ?? 0,
      },
    })),
    topQualityPosts: (topQualityPosts as CollectedData['topQualityPosts']),
    topEngagementPosts: (topEngagementPosts as CollectedData['topEngagementPosts']),
    cafeSentiment: (cafeSentimentRaw as GroupByResult[]).map((s: GroupByResult) => ({
      boardCategory: s.boardCategory ?? 'unknown',
      sentiment: s.sentiment ?? 'unknown',
      _count: s._count.id,
    })),
    recentTrends: recentTrends as CollectedData['recentTrends'],
    postEngagement: (postEngagement as PostGroupBy[]).map((p: PostGroupBy) => ({
      boardType: p.boardType,
      _count: p._count.id,
      _avg: {
        viewCount: p._avg.viewCount ?? 0,
        likeCount: p._avg.likeCount ?? 0,
        commentCount: p._avg.commentCount ?? 0,
        scrapCount: p._avg.scrapCount ?? 0,
      },
    })),
    topTrendingPosts: topTrendingPosts as CollectedData['topTrendingPosts'],
    postBySource: (postBySource as SourceGroupBy[]).map((p: SourceGroupBy) => ({
      source: p.source,
      _count: p._count.id,
      _avg: { viewCount: p._avg.viewCount ?? 0, likeCount: p._avg.likeCount ?? 0 },
    })),
    userDemographics: {
      birthYearDist: (birthYearDist as UserGroupBy[]).map((b: UserGroupBy) => ({ birthYear: b.birthYear ?? null, _count: b._count.id })),
      genderDist: (genderDist as UserGroupBy[]).map((g: UserGroupBy) => ({ gender: g.gender ?? null, _count: g._count.id })),
      gradeDist: (gradeDist as UserGroupBy[]).map((g: UserGroupBy) => ({ grade: g.grade ?? '', _count: g._count.id })),
      totalUsers,
    },
    searchTerms,
    topPages,
    timePatterns: {
      postsByHour: postsByHourRaw,
      postsByDow: postsByDowRaw,
    },
    socialPerformance: (socialPerformance as SocialGroupBy[]).map((s: SocialGroupBy) => ({
      contentType: s.contentType,
      _count: s._count.id,
      avgMetrics: null,
    })),
    experimentLearnings: experimentLearnings as CollectedData['experimentLearnings'],
  }
}

// ────────────────────────────────────────
// 2. 데이터 → AI 프롬프트 변환
// ────────────────────────────────────────

function formatDataForAI(data: CollectedData): string {
  const sections: string[] = []

  // A. 카페 콘텐츠 분석
  sections.push(`## A. 네이버 카페 콘텐츠 (50·60대가 실제로 하는 이야기)

### 카테고리별 분포:
${data.cafeCategoryStats.map(c =>
  `- ${c.boardCategory}: ${c._count}건 (평균 품질 ${c._avg.qualityScore.toFixed(1)}, 좋아요 ${c._avg.likeCount.toFixed(1)}, 댓글 ${c._avg.commentCount.toFixed(1)})`,
).join('\n')}

### 가장 높은 참여를 받은 글 TOP 20:
${data.topEngagementPosts.slice(0, 20).map((p, i) =>
  `${i + 1}. [${p.boardCategory ?? '일반'}] "${p.title}" — 좋아요 ${p.likeCount}, 댓글 ${p.commentCount}, 조회 ${p.viewCount} (${p.cafeName})`,
).join('\n')}

### 감성 분포:
${data.cafeSentiment.slice(0, 15).map(s =>
  `- ${s.boardCategory}/${s.sentiment}: ${s._count}건`,
).join('\n')}`)

  // B. 트렌드 패턴
  const allKeywords = new Map<string, number>()
  const allTopics = new Map<string, number>()
  for (const trend of data.recentTrends) {
    const keywords = trend.keywords as Array<{ word: string; frequency: number }> | null
    const topics = trend.hotTopics as Array<{ topic: string; count: number }> | null
    if (keywords) {
      for (const k of keywords) {
        allKeywords.set(k.word, (allKeywords.get(k.word) ?? 0) + k.frequency)
      }
    }
    if (topics) {
      for (const t of topics) {
        allTopics.set(t.topic, (allTopics.get(t.topic) ?? 0) + t.count)
      }
    }
  }
  const topKeywords = [...allKeywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
  const topTopics = [...allTopics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

  // 페르소나 힌트 집계
  const personaHints: string[] = []
  for (const trend of data.recentTrends) {
    const hints = trend.personaHints as Array<{ type: string; description: string }> | null
    if (hints) {
      for (const h of hints) {
        personaHints.push(`${h.type}: ${h.description}`)
      }
    }
  }

  sections.push(`## B. 30일간 트렌드 키워드 & 토픽

### 반복 키워드 TOP 30:
${topKeywords.map(([word, freq]) => `- ${word}: ${freq}회`).join('\n')}

### 반복 핫토픽 TOP 15:
${topTopics.map(([topic, count]) => `- ${topic}: ${count}건`).join('\n')}

### AI가 감지한 페르소나 힌트 (최근 30일):
${[...new Set(personaHints)].slice(0, 15).map(h => `- ${h}`).join('\n')}`)

  // C. 우나어 플랫폼 참여도
  sections.push(`## C. 우나어 플랫폼 콘텐츠 참여도

### 게시판별 성과:
${data.postEngagement.map(p =>
  `- ${p.boardType}: ${p._count}건 (평균 조회 ${p._avg.viewCount.toFixed(0)}, 좋아요 ${p._avg.likeCount.toFixed(1)}, 댓글 ${p._avg.commentCount.toFixed(1)}, 스크랩 ${p._avg.scrapCount.toFixed(1)})`,
).join('\n')}

### 트렌딩 상위 글:
${data.topTrendingPosts.slice(0, 15).map((p, i) =>
  `${i + 1}. [${p.boardType}/${p.category ?? '일반'}] "${p.title}" — 점수 ${p.trendingScore.toFixed(1)}, 조회 ${p.viewCount}, 좋아요 ${p.likeCount}, 댓글 ${p.commentCount} (소스: ${p.source})`,
).join('\n')}

### 콘텐츠 소스별 비교:
${data.postBySource.map(p =>
  `- ${p.source}: ${p._count}건 (평균 조회 ${p._avg.viewCount.toFixed(0)}, 좋아요 ${p._avg.likeCount.toFixed(1)})`,
).join('\n')}`)

  // D. 사용자 인구통계
  const { userDemographics: ud } = data
  sections.push(`## D. 사용자 인구통계 (총 ${ud.totalUsers}명)

### 출생연도 분포:
${ud.birthYearDist.slice(0, 15).map(b =>
  `- ${b.birthYear ?? '미입력'}: ${b._count}명`,
).join('\n')}

### 성별 분포:
${ud.genderDist.map(g => `- ${g.gender ?? '미입력'}: ${g._count}명`).join('\n')}

### 등급 분포:
${ud.gradeDist.map(g => `- ${g.grade}: ${g._count}명`).join('\n')}`)

  // E. 검색어 & 페이지뷰
  sections.push(`## E. 사용자 검색어 & 인기 페이지 (최근 30일)

### 검색어 TOP 50:
${data.searchTerms.length > 0
    ? data.searchTerms.map(s => `- "${s.query}": ${s.count}회`).join('\n')
    : '(검색 데이터 없음 — 아직 사용자 유입 초기)'}

### 인기 페이지 TOP 20:
${data.topPages.length > 0
    ? data.topPages.map(p => `- ${p.path}: ${p.count}회`).join('\n')
    : '(페이지뷰 데이터 없음)'}`)

  // F. 시간 패턴
  const dowNames = ['일', '월', '화', '수', '목', '금', '토']
  sections.push(`## F. 활동 시간 패턴

### 시간대별 포스트:
${data.timePatterns.postsByHour.map(h => `- ${h.hour}시(KST): ${h.count}건`).join('\n') || '(데이터 없음)'}

### 요일별 포스트:
${data.timePatterns.postsByDow.map(d => `- ${dowNames[d.dow] ?? d.dow}: ${d.count}건`).join('\n') || '(데이터 없음)'}`)

  // G. SNS 성과
  sections.push(`## G. SNS 외부 마케팅 성과

### 콘텐츠 유형별 발행 수:
${data.socialPerformance.map(s => `- ${s.contentType}: ${s._count}건`).join('\n') || '(아직 SNS 발행 데이터 없음)'}

### A/B 실험 인사이트:
${data.experimentLearnings.length > 0
    ? data.experimentLearnings.map(e => `- [${e.variable}] ${e.hypothesis}\n  결과: ${e.learnings ?? '분석 중'}`).join('\n')
    : '(아직 완료된 실험 없음)'}`)

  // 고품질 글 내용 샘플 (AI가 톤/주제를 깊이 파악하도록)
  const contentSamples = data.topQualityPosts.slice(0, 30).map((p, i) =>
    `### 글 ${i + 1} [${p.boardCategory ?? '일반'}] (품질 ${p.qualityScore.toFixed(0)}, 좋아요 ${p.likeCount}, 댓글 ${p.commentCount})
제목: ${p.title}
내용 (200자): ${p.content.slice(0, 200)}...`,
  ).join('\n\n')

  sections.push(`## H. 고품질 글 내용 샘플 (30개)
이 글들은 50·60대가 실제로 작성한 글 중 품질 점수가 가장 높은 글입니다.
이 글들의 톤, 주제, 감정을 분석하세요.

${contentSamples}`)

  return sections.join('\n\n---\n\n')
}

// ────────────────────────────────────────
// 3. Claude Opus 전략 분석
// ────────────────────────────────────────

async function analyzeWithOpus(dataText: string): Promise<StrategicAnalysis> {
  console.log(`[Strategist] Opus 분석 요청 — 데이터 ${dataText.length}자`)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `당신은 한국 50·60대 커뮤니티 플랫폼 "우리 나이가 어때서"의 사용자 리서치 전략가입니다.

당신에게 실제 데이터가 주어집니다:
- 네이버 카페 3곳(우리가남이가, 실버사랑, 5060세대)에서 크롤링한 게시글
- 플랫폼 내 사용자 행동 데이터
- 검색어, 참여도, 인구통계

당신의 임무는 이 사람들을 깊이 이해하는 것입니다.
"시니어"나 "액티브 시니어" 같은 용어를 절대 쓰지 마세요.
이들을 욕망과 두려움과 일상이 있는 진짜 사람으로 바라보세요.

분석 관점:
1. 이들이 진짜 원하는 것은 무엇인가? (표면적 니즈가 아닌 깊은 욕망)
2. 왜 커뮤니티에 글을 쓰는가? 어떤 감정이 동기인가?
3. 말하는 것(검색어)과 실제 행동(참여도)의 차이는?
4. 어떤 콘텐츠가 진짜 공감을 얻는가? 왜?
5. 현재 페르소나(외로움해소형/실리추구형/체면중시형/생계절실형)는 맞는가?

현재 헌법의 미션: "50·60대가 다시 사회와 연결되고, 자신만의 속도로 새로운 삶을 시작할 수 있도록 돕는다."
현재 비전: "나이가 가능성의 한계가 되지 않는 세상, 누구나 설레는 마음으로 두 번째 전성기를 맞이하는 라이프 플랫폼."

반드시 아래 JSON 형식으로만 응답하세요. 한국어로 작성하세요.`,
    messages: [{
      role: 'user',
      content: `아래 데이터를 기반으로 사용자를 심층 분석해주세요.

${dataText}

응답 형식 (JSON):
{
  "demographicInsights": {
    "ageGenderProfile": "데이터 기반 인구통계 요약",
    "geographicPatterns": "지역 집중도",
    "digitalBehavior": "이용 패턴 (언제/어떻게)",
    "keyFindings": ["핵심 발견 1", "핵심 발견 2", "..."]
  },
  "coreDesires": [
    {
      "desire": "핵심 욕망명",
      "evidence": "어떤 데이터가 이를 뒷받침하는가",
      "currentSatisfaction": "low|medium|high",
      "opportunity": "우나어가 이를 어떻게 더 잘 충족할 수 있는가"
    }
  ],
  "personas": [
    {
      "id": "P1",
      "name": "페르소나 이름",
      "profile": "인구통계 설명",
      "coreDesire": "핵심 동기",
      "painPoints": ["고통 1", "고통 2"],
      "contentPreferences": ["선호 콘텐츠 유형"],
      "platformBehavior": "플랫폼 사용 패턴",
      "keyMetric": "이 페르소나를 잘 서빙하고 있는지 측정 지표",
      "evidenceStrength": "strong|moderate|hypothesis",
      "dataSource": "어떤 데이터에서 도출됨"
    }
  ],
  "contentInsights": {
    "topEngagingCategories": ["카테고리 순위"],
    "gapAnalysis": "사용자가 찾지만 없는 콘텐츠",
    "saidVsDid": "말하는 것 vs 실제 행동 차이",
    "magazineTopicRecommendations": ["매거진 추천 주제"],
    "communityTopicRecommendations": ["커뮤니티 추천 주제"]
  },
  "constitutionUpdates": {
    "missionSuggestion": "새로운 미션 제안",
    "visionSuggestion": "새로운 비전 제안",
    "essenceSuggestion": "새로운 에센스(한줄 정의) 제안",
    "personaPriorityChange": "페르소나 우선순위 변경 권고",
    "contentPolicyChange": "콘텐츠 정책 변경 권고",
    "toneAdjustment": "톤앤매너 조정 권고"
  },
  "snsStrategy": {
    "primaryPlatform": "주력 플랫폼 추천",
    "platformPersonaAlignment": {"플랫폼": "대상 페르소나"},
    "contentTypeByPlatform": {"플랫폼": ["콘텐츠 유형"]},
    "magazineTopics": ["매거진 카테고리 재정의"]
  },
  "methodology": {
    "dataQuality": "데이터 품질 평가",
    "sampleSize": "분석 규모",
    "limitations": ["한계점"],
    "recommendedFollowUp": ["추가 수집 권고"]
  }
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  console.log(`[Strategist] Opus 응답: ${text.length}자`)

  // JSON 파싱 (코드블록 제거 + repair)
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned

  try {
    return JSON.parse(jsonStr) as StrategicAnalysis
  } catch {
    console.warn('[Strategist] JSON 1차 파싱 실패, 복구 시도...')
    let repaired = jsonStr
    const lastComplete = repaired.lastIndexOf('}')
    if (lastComplete > 0) {
      repaired = repaired.slice(0, lastComplete + 1)
      const openBrackets = (repaired.match(/\[/g) ?? []).length
      const closeBrackets = (repaired.match(/\]/g) ?? []).length
      const openBraces = (repaired.match(/\{/g) ?? []).length
      const closeBraces = (repaired.match(/\}/g) ?? []).length
      repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets))
      repaired += '}'.repeat(Math.max(0, openBraces - closeBraces))
    }
    try {
      return JSON.parse(repaired) as StrategicAnalysis
    } catch {
      console.error('[Strategist] JSON 복구 실패, 원본 앞부분:', text.slice(0, 500))
      throw new Error('Opus 응답 JSON 파싱 실패')
    }
  }
}

// ────────────────────────────────────────
// 4. 출력 포맷팅
// ────────────────────────────────────────

function formatMarkdown(analysis: StrategicAnalysis): string {
  const lines: string[] = []
  const now = new Date().toISOString().slice(0, 10)

  lines.push(`# 우나어 사용자 심층 분석 리포트`)
  lines.push(`> 생성일: ${now} | 모델: ${MODEL}\n`)

  // 1. 인구통계
  const di = analysis.demographicInsights
  if (di) {
    lines.push(`## 1. 인구통계 인사이트`)
    lines.push(`- **연령/성별**: ${di.ageGenderProfile}`)
    lines.push(`- **지역**: ${di.geographicPatterns}`)
    lines.push(`- **디지털 행동**: ${di.digitalBehavior}`)
    lines.push(`\n**핵심 발견:**`)
    for (const f of (di.keyFindings ?? [])) {
      lines.push(`- ${f}`)
    }
  }

  // 2. 핵심 욕망
  lines.push(`\n## 2. 핵심 욕망 — 이 사람들은 진짜 무엇을 원하는가?`)
  for (const d of (analysis.coreDesires ?? [])) {
    lines.push(`\n### ${d.desire}`)
    lines.push(`- **근거**: ${d.evidence}`)
    lines.push(`- **현재 충족도**: ${d.currentSatisfaction}`)
    lines.push(`- **기회**: ${d.opportunity}`)
  }

  // 3. 페르소나
  lines.push(`\n## 3. 검증된 페르소나`)
  for (const p of (analysis.personas ?? [])) {
    lines.push(`\n### ${p.id}. ${p.name}`)
    lines.push(`- **프로필**: ${p.profile}`)
    lines.push(`- **핵심 동기**: ${p.coreDesire}`)
    lines.push(`- **고통**: ${p.painPoints?.join(', ') ?? 'N/A'}`)
    lines.push(`- **선호 콘텐츠**: ${p.contentPreferences?.join(', ') ?? 'N/A'}`)
    lines.push(`- **플랫폼 행동**: ${p.platformBehavior}`)
    lines.push(`- **핵심 지표**: ${p.keyMetric}`)
    lines.push(`- **근거 강도**: ${p.evidenceStrength} (${p.dataSource})`)
  }

  // 4. 콘텐츠 전략
  const ci = analysis.contentInsights
  if (ci) {
    lines.push(`\n## 4. 콘텐츠 전략 인사이트`)
    lines.push(`- **참여도 높은 카테고리**: ${ci.topEngagingCategories?.join(' > ') ?? 'N/A'}`)
    lines.push(`- **갭 분석**: ${ci.gapAnalysis ?? 'N/A'}`)
    lines.push(`- **말 vs 행동**: ${ci.saidVsDid ?? 'N/A'}`)
    lines.push(`\n**매거진 추천**: ${ci.magazineTopicRecommendations?.join(', ') ?? 'N/A'}`)
    lines.push(`**커뮤니티 추천**: ${ci.communityTopicRecommendations?.join(', ') ?? 'N/A'}`)
  }

  // 5. 헌법 권고안
  const cu = analysis.constitutionUpdates
  if (cu) {
    lines.push(`\n## 5. 헌법 업데이트 권고안`)
    lines.push(`- **미션**: ${cu.missionSuggestion ?? 'N/A'}`)
    lines.push(`- **비전**: ${cu.visionSuggestion ?? 'N/A'}`)
    lines.push(`- **에센스**: ${cu.essenceSuggestion ?? 'N/A'}`)
    lines.push(`- **페르소나 우선순위**: ${cu.personaPriorityChange ?? 'N/A'}`)
    lines.push(`- **콘텐츠 정책**: ${cu.contentPolicyChange ?? 'N/A'}`)
    lines.push(`- **톤앤매너**: ${cu.toneAdjustment ?? 'N/A'}`)
  }

  // 6. SNS 전략
  const sns = analysis.snsStrategy
  if (sns) {
    lines.push(`\n## 6. SNS 채널 전략`)
    lines.push(`- **주력 플랫폼**: ${sns.primaryPlatform ?? 'N/A'}`)
    if (sns.platformPersonaAlignment) {
      lines.push(`\n**플랫폼-페르소나 매핑:**`)
      for (const [platform, persona] of Object.entries(sns.platformPersonaAlignment)) {
        lines.push(`- ${platform} → ${persona}`)
      }
    }
    lines.push(`\n**매거진 카테고리 재정의**: ${sns.magazineTopics?.join(', ') ?? 'N/A'}`)
  }

  // 7. 방법론
  const meth = analysis.methodology
  if (meth) {
    lines.push(`\n## 7. 방법론 & 한계`)
    lines.push(`- **데이터 품질**: ${meth.dataQuality ?? 'N/A'}`)
    lines.push(`- **분석 규모**: ${meth.sampleSize ?? 'N/A'}`)
    lines.push(`- **한계**: ${meth.limitations?.join('; ') ?? 'N/A'}`)
    lines.push(`- **추가 수집 권고**: ${meth.recommendedFollowUp?.join('; ') ?? 'N/A'}`)
  }

  return lines.join('\n')
}

function formatSlackSummary(analysis: StrategicAnalysis): string {
  const desires = (analysis.coreDesires ?? []).slice(0, 3)
    .map((d, i) => `${i + 1}. *${d.desire}* (충족도: ${d.currentSatisfaction})\n   └ ${d.opportunity}`)
    .join('\n') || '데이터 부족'

  const personas = (analysis.personas ?? [])
    .map(p => `• *${p.name}* — ${p.coreDesire} [${p.evidenceStrength}]`)
    .join('\n') || '데이터 부족'

  const cu = analysis.constitutionUpdates
  const sns = analysis.snsStrategy

  return `📊 *사용자 심층 분석 완료*

🔥 *핵심 욕망 TOP 3*
${desires}

👤 *검증된 페르소나*
${personas}

📝 *미션 권고*
${cu?.missionSuggestion ?? 'N/A'}

🔭 *비전 권고*
${cu?.visionSuggestion ?? 'N/A'}

📌 *에센스 권고*
${cu?.essenceSuggestion ?? 'N/A'}

💡 *페르소나 변경*
${cu?.personaPriorityChange ?? 'N/A'}

📱 *주력 SNS*: ${sns?.primaryPlatform ?? 'N/A'}

⚠️ 이 분석은 권고안입니다. 헌법 변경은 창업자 승인이 필요합니다.
전체 리포트는 BotLog 또는 GitHub Actions 로그에서 확인하세요.`
}

// ────────────────────────────────────────
// 5. 메인 실행
// ────────────────────────────────────────

async function main() {
  console.log('[Strategist] 사용자 심층 분석 시작')
  const startTime = Date.now()

  // 1) 데이터 수집
  console.log('[Strategist] 데이터 수집 중...')
  const data = await collectData()

  const dataPoints = data.cafeCategoryStats.length
    + data.topQualityPosts.length
    + data.topEngagementPosts.length
    + data.recentTrends.length
    + data.topTrendingPosts.length
    + data.userDemographics.totalUsers
    + data.searchTerms.length
    + data.topPages.length

  console.log(`[Strategist] 데이터 수집 완료 — ${dataPoints}개 데이터 포인트`)

  if (data.cafeCategoryStats.length === 0 && data.topTrendingPosts.length === 0) {
    console.warn('[Strategist] 분석할 데이터 부족 — CafePost/Post 모두 비어있음')
    await notifySlack({
      level: 'important',
      agent: 'STRATEGIST',
      title: '사용자 심층 분석 — 데이터 부족',
      body: 'CafePost와 Post 데이터가 모두 비어있어 분석 불가. 크롤러 상태 확인 필요.',
    })
    await disconnect()
    return
  }

  // 2) AI 분석용 텍스트 생성
  const dataText = formatDataForAI(data)
  console.log(`[Strategist] AI 프롬프트: ${dataText.length}자`)

  // 3) Claude Opus 분석
  console.log('[Strategist] Opus 분석 중... (1-2분 소요)')
  const analysis = await analyzeWithOpus(dataText)
  console.log(`[Strategist] 분석 완료 — 페르소나 ${analysis.personas.length}개, 욕망 ${analysis.coreDesires.length}개`)

  // 4) Markdown 전체 리포트 출력
  const markdown = formatMarkdown(analysis)
  console.log('\n' + '='.repeat(80))
  console.log(markdown)
  console.log('='.repeat(80) + '\n')

  // 5) Slack 요약 전송
  const slackSummary = formatSlackSummary(analysis)
  await sendSlackMessage('CEO_FOUNDER', slackSummary)

  // 6) BotLog 저장
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CEO',
      action: 'USER_DEEP_ANALYSIS',
      status: 'SUCCESS',
      details: JSON.stringify({
        analysis,
        metadata: {
          dataPoints,
          promptLength: dataText.length,
          model: MODEL,
          generatedAt: new Date().toISOString(),
        },
      }),
      itemCount: analysis.personas.length,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[Strategist] 완료 — ${Math.round(durationMs / 1000)}초, 비용 ~$0.20`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[Strategist] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'STRATEGIST',
    title: '사용자 심층 분석 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
