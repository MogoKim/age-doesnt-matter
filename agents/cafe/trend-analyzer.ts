// LOCAL ONLY — 카페 트렌드 분석은 크롤링 데이터 의존, 로컬 실행
/**
 * 트렌드 분석기
 * 크롤링된 카페 글들을 Claude AI가 분석하여
 * 핫토픽, 키워드, 매거진 주제 추천, 페르소나 힌트 추출
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import type { TrendAnalysis } from './types.js'

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()

/** 오늘 크롤링된 글 가져오기 */
async function getTodayPosts() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return prisma.cafePost.findMany({
    where: {
      crawledAt: { gte: todayStart },
      qualityScore: { gte: 30 }, // 최소 품질 점수 이상만 분석
    },
    orderBy: { qualityScore: 'desc' },
    take: 100,
    select: {
      id: true,
      cafeId: true,
      cafeName: true,
      title: true,
      content: true,
      category: true,
      boardCategory: true,
      qualityScore: true,
      likeCount: true,
      commentCount: true,
      viewCount: true,
      // 댓글 (speechTone 집계에 사용)
      topComments: true,
      boardName: true,
      // 심리 분석 결과 (psych-analyzer 실행 후 채워짐)
      emotionTags: true,
      desireCategory: true,
      desireType: true,
      psychInsight: true,
      urgencyLevel: true,
      aiAnalyzed: true,
    },
  })
}

/** 심리 분석 결과 집계 — desireMap, emotionDistribution, urgentTopics */
function aggregatePsychData(posts: Awaited<ReturnType<typeof getTodayPosts>>) {
  const analyzedPosts = posts.filter(p => p.aiAnalyzed && p.desireCategory)

  if (analyzedPosts.length === 0) {
    return { desireMap: null, emotionDistribution: null, urgentTopics: null, dominantDesire: null, dominantEmotion: null }
  }

  // 욕망 카테고리 분포 — 카페별 50:50 가중 평균
  // 이유: wgang(여성/갱년기)이 글이 많으면 HEALTH만 dominant가 되는 편향 방지
  const cafeIds = [...new Set(analyzedPosts.map(p => p.cafeId))]
  const perCafeDesireMap: Record<string, Record<string, number>> = {}
  for (const cid of cafeIds) {
    const cafePosts = analyzedPosts.filter(p => p.cafeId === cid)
    const count: Record<string, number> = {}
    for (const p of cafePosts) {
      const cat = p.desireCategory!
      count[cat] = (count[cat] ?? 0) + 1
    }
    const total = cafePosts.length
    perCafeDesireMap[cid] = {}
    for (const [cat, cnt] of Object.entries(count)) {
      perCafeDesireMap[cid][cat] = cnt / total // 비율 (0~1)
    }
  }
  // 카페 수에 상관없이 균등 가중 평균 (1개 카페면 그대로, 2개면 50:50)
  const desireMap: Record<string, number> = {}
  const weight = 1 / cafeIds.length
  for (const ratioMap of Object.values(perCafeDesireMap)) {
    for (const [cat, ratio] of Object.entries(ratioMap)) {
      desireMap[cat] = (desireMap[cat] ?? 0) + ratio * weight
    }
  }
  // 퍼센트 변환
  for (const cat of Object.keys(desireMap)) {
    desireMap[cat] = Math.round(desireMap[cat] * 100)
  }
  const totalAnalyzed = analyzedPosts.length

  // 감정 분포
  const emotionCount: Record<string, number> = {}
  for (const p of analyzedPosts) {
    for (const tag of (p.emotionTags as string[])) {
      emotionCount[tag] = (emotionCount[tag] ?? 0) + 1
    }
  }
  const emotionDistribution: Record<string, number> = {}
  for (const [tag, cnt] of Object.entries(emotionCount)) {
    emotionDistribution[tag] = Math.round((cnt / totalAnalyzed) * 100)
  }

  // 지배적 욕망/감정
  const dominantDesire = Object.entries(desireMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const dominantEmotion = Object.entries(emotionCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // 긴급 토픽 (urgencyLevel >= 4)
  const urgentPosts = analyzedPosts.filter(p => (p.urgencyLevel ?? 0) >= 4)
  const urgentByCategory: Record<string, { count: number; urgencySum: number; insights: string[] }> = {}
  for (const p of urgentPosts) {
    const cat = p.desireCategory!
    if (!urgentByCategory[cat]) urgentByCategory[cat] = { count: 0, urgencySum: 0, insights: [] }
    urgentByCategory[cat].count++
    urgentByCategory[cat].urgencySum += p.urgencyLevel ?? 0
    if (p.psychInsight) urgentByCategory[cat].insights.push(p.psychInsight)
  }
  const urgentTopics = Object.entries(urgentByCategory)
    .map(([cat, data]) => ({
      topic: cat,
      count: data.count,
      urgencyAvg: Math.round(data.urgencySum / data.count * 10) / 10,
      psychInsight: data.insights[0] ?? '',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return { desireMap, emotionDistribution, urgentTopics, dominantDesire, dominantEmotion }
}

/** Claude에게 트렌드 분석 요청 */
async function analyzeTrends(posts: Awaited<ReturnType<typeof getTodayPosts>>): Promise<TrendAnalysis> {
  const postSummaries = posts.map((p, i) =>
    `[${i + 1}] (${p.cafeName}/${p.boardCategory ?? p.category ?? '일반'}) [품질${Math.round(p.qualityScore)}] "${p.title}" — 좋아요 ${p.likeCount}, 댓글 ${p.commentCount}\n   ${p.content.slice(0, 200)}`,
  ).join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 5000,
    system: `당신은 50~60대 커뮤니티 트렌드 분석가입니다.
네이버 카페 3곳(우리가남이가, 실버사랑, 5060세대)에서 수집한 게시글을 분석합니다.

분석 목적:
1. 요즘 50~60대가 어떤 이야기를 하는지 파악
2. 우리 커뮤니티(우나어)에서 다룰 매거진 주제 추천
3. 새로운 페르소나(시드봇) 캐릭터 힌트 제공

반드시 아래 JSON 형식으로만 응답하세요.`,
    messages: [{
      role: 'user',
      content: `오늘 수집된 카페 게시글 ${posts.length}개를 분석해주세요.

${postSummaries}

응답 형식 (JSON):
{
  "hotTopics": [
    {"topic": "주제명", "count": 관련글수, "sentiment": "positive|neutral|negative", "examples": ["글제목1", "글제목2"]}
  ],
  "keywords": [
    {"word": "키워드", "frequency": 출현횟수}
  ],
  "sentimentMap": {"positive": 비율, "neutral": 비율, "negative": 비율},
  "magazineTopics": [
    {"title": "매거진 제목 제안", "reason": "추천 이유", "score": 1~10, "relatedPosts": ["글제목"]}
  ],
  "personaHints": [
    {"type": "관심사유형", "description": "이런 캐릭터가 있으면 좋겠다", "examplePosts": ["글제목"]}
  ]
}

hotTopics: 상위 5~7개, keywords: 상위 15개, magazineTopics: 상위 3개, personaHints: 2~3개`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  console.log(`[TrendAnalyzer] AI 응답 길이: ${text.length}자`)

  // JSON 파싱 (코드블록 제거 + 첫 번째 JSON 객체 추출)
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned
  try {
    const parsed = JSON.parse(jsonStr)
    console.log(`[TrendAnalyzer] 파싱 성공 — hotTopics: ${parsed.hotTopics?.length}, keywords: ${parsed.keywords?.length}, magazineTopics: ${parsed.magazineTopics?.length}`)
    return parsed as TrendAnalysis
  } catch {
    console.log(`[TrendAnalyzer] JSON 파싱 실패 (${jsonStr.length}자) — max_tokens 부족 가능성`)
    // 불완전한 JSON 복구 시도: 닫히지 않은 배열/객체 닫기
    let repaired = jsonStr
    const openBraces = (repaired.match(/\{/g) ?? []).length
    const openBrackets = (repaired.match(/\[/g) ?? []).length
    // 마지막 완전한 항목까지 자르기
    const lastComplete = repaired.lastIndexOf('}')
    if (lastComplete > 0) {
      repaired = repaired.slice(0, lastComplete + 1)
      repaired += ']}'.repeat(Math.max(0, openBrackets - (repaired.match(/\]/g) ?? []).length))
      repaired += '}'.repeat(Math.max(0, openBraces - (repaired.match(/\}/g) ?? []).length))
    }
    try {
      const parsed = JSON.parse(repaired)
      console.log(`[TrendAnalyzer] JSON 복구 성공 — hotTopics: ${parsed.hotTopics?.length ?? 0}`)
      return parsed as TrendAnalysis
    } catch {
      console.log('[TrendAnalyzer] JSON 복구도 실패, 원본 앞부분:', text.slice(0, 300))
      // Slack 알림 — 파싱 실패는 매거진 미발행으로 이어지는 침묵 장애
      await notifySlack({
        level: 'important',
        agent: 'TREND_ANALYZER',
        title: '⚠️ 트렌드 분석 JSON 파싱 실패',
        body: `AI 응답 파싱 2차 실패 — magazineTopics 빈 배열로 폴백\n응답 길이: ${text.length}자 (max_tokens: 4000)\n원본 앞부분: ${text.slice(0, 200)}\n→ 오늘 매거진이 자동 발행되지 않을 수 있음`,
      })
      return {
        hotTopics: [],
        keywords: [],
        sentimentMap: { positive: 33, neutral: 34, negative: 33 },
        magazineTopics: [],
        personaHints: [],
      }
    }
  }
}

/**
 * 말투 학습 집계 — 5060 커뮤니티 특화 어휘 + 인상적 표현 추출
 * DB 스키마 변경 없이 cafeSummary JSON에 저장됨 → SEED봇 주입용
 */
function aggregateSpeechTone(posts: Awaited<ReturnType<typeof getTodayPosts>>): {
  topKeyPhrases: string[]
  topCommunityVocab: string[]
} {
  // 5060 커뮤니티 특화 어휘 패턴 (갱년기, 은퇴, 관계 중심)
  const COMMUNITY_VOCAB_PATTERNS = [
    '갱년기', '우리 나이', '언니들', '이 나이에', '손주', '우리 또래',
    '인생 2막', '은퇴 후', '퇴직', '노후', '노년', '50대', '60대',
    '할머니', '아줌마', '남편이', '자녀가', '부모님', '어머니',
    '건강검진', '혈압', '당뇨', '관절', '영양제', '한의원',
    '연금', '국민연금', '재테크', '보험', '적금',
    '산책', '등산', '텃밭', '귀촌', '시골',
    '드라마', '트로트', '임영웅', '콘서트',
    '어머 진짜', '맞아요', '저도 그래요', '언니',
  ]

  const vocabCounts: Record<string, number> = {}

  for (const post of posts) {
    const commentTexts = post.topComments
      ? (post.topComments as Array<{ content?: string }>).map(c => c.content ?? '').join(' ')
      : ''
    const fullText = `${post.title} ${post.content.slice(0, 500)} ${commentTexts}`

    for (const vocab of COMMUNITY_VOCAB_PATTERNS) {
      if (fullText.includes(vocab)) {
        vocabCounts[vocab] = (vocabCounts[vocab] ?? 0) + 1
      }
    }
  }

  // 빈도 상위 10개 커뮤니티 어휘
  const topCommunityVocab = Object.entries(vocabCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([vocab]) => vocab)

  // keyPhrases: 댓글에서 반응 많은 짧은 표현 추출 (2-4어절 패턴)
  const phraseCounts: Record<string, number> = {}
  const PHRASE_PATTERN = /[가-힣]{2,4}\s[가-힣]{2,4}(?:\s[가-힣]{1,4})?/g
  for (const post of posts) {
    const commentTexts = post.topComments
      ? (post.topComments as Array<{ content?: string }>).map(c => c.content ?? '').join(' ')
      : ''
    const matches = commentTexts.match(PHRASE_PATTERN) ?? []
    for (const phrase of matches) {
      if (phrase.length >= 4 && phrase.length <= 15) {
        phraseCounts[phrase] = (phraseCounts[phrase] ?? 0) + 1
      }
    }
  }
  const topKeyPhrases = Object.entries(phraseCounts)
    .filter(([, cnt]) => cnt >= 2) // 2회 이상 등장한 표현만
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase)

  return { topKeyPhrases, topCommunityVocab }
}

/** 개별 글에 토픽 태그 + 감정 업데이트 */
async function tagPosts(posts: Awaited<ReturnType<typeof getTodayPosts>>, analysis: TrendAnalysis) {
  const topicWords = analysis.hotTopics.map(t => t.topic.toLowerCase())

  for (const post of posts) {
    const matchedTopics = topicWords.filter(topic =>
      post.title.toLowerCase().includes(topic) || post.content.toLowerCase().includes(topic),
    )

    // 품질 점수 기반 isUsable (qualityScore >= 60)
    const isUsable = (post.qualityScore ?? 0) >= 60

    await prisma.cafePost.update({
      where: { id: post.id },
      data: {
        topics: matchedTopics.length > 0 ? matchedTopics : [],
        isUsable,
      },
    })
  }
}

/** 트렌드 결과 DB 저장 */
async function saveTrend(
  analysis: TrendAnalysis,
  totalPosts: number,
  cafeSummary: Record<string, number>,
  psychData: ReturnType<typeof aggregatePsychData>,
  speechTone: ReturnType<typeof aggregateSpeechTone>,
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const baseData = {
    hotTopics: JSON.parse(JSON.stringify(analysis.hotTopics)),
    keywords: JSON.parse(JSON.stringify(analysis.keywords)),
    sentimentMap: JSON.parse(JSON.stringify(analysis.sentimentMap)),
    magazineTopics: JSON.parse(JSON.stringify(analysis.magazineTopics)),
    personaHints: JSON.parse(JSON.stringify(analysis.personaHints)),
    totalPosts,
    // cafeSummary에 speechTone 집계 포함 (DB 스키마 변경 없이 저장)
    cafeSummary: JSON.parse(JSON.stringify({
      ...cafeSummary,
      topKeyPhrases: speechTone.topKeyPhrases,
      topCommunityVocab: speechTone.topCommunityVocab,
    })),
    // 심리 분석 집계
    desireMap: psychData.desireMap ? JSON.parse(JSON.stringify(psychData.desireMap)) : undefined,
    emotionDistribution: psychData.emotionDistribution ? JSON.parse(JSON.stringify(psychData.emotionDistribution)) : undefined,
    urgentTopics: psychData.urgentTopics ? JSON.parse(JSON.stringify(psychData.urgentTopics)) : undefined,
    dominantDesire: psychData.dominantDesire ?? undefined,
    dominantEmotion: psychData.dominantEmotion ?? undefined,
  }

  await prisma.cafeTrend.upsert({
    where: { date_period: { date: today, period: 'daily' } },
    create: { date: today, period: 'daily', ...baseData },
    update: baseData,
  })
}

/** 인기글 vs 최신글 욕망 갭 분석 — 10%p 이상 차이만 표시 */
function calcDesireGap(posts: Awaited<ReturnType<typeof getTodayPosts>>): string | null {
  const analyzedPosts = posts.filter(p => p.aiAnalyzed && p.desireCategory)
  const popularPosts = analyzedPosts.filter(p => p.boardName === '인기글')
  const latestPosts = analyzedPosts.filter(p => p.boardName !== '인기글')

  // 최소 샘플 5건 미만이면 신뢰도 낮아 스킵
  if (popularPosts.length < 5 || latestPosts.length < 5) return null

  const calcRatio = (items: typeof analyzedPosts): Record<string, number> => {
    const cnt: Record<string, number> = {}
    for (const p of items) cnt[p.desireCategory!] = (cnt[p.desireCategory!] ?? 0) + 1
    const total = items.length
    return Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, Math.round(v / total * 100)]))
  }

  const popularMap = calcRatio(popularPosts)
  const latestMap = calcRatio(latestPosts)

  const gaps: string[] = []
  const allDesires = new Set([...Object.keys(popularMap), ...Object.keys(latestMap)])
  for (const desire of allDesires) {
    const pop = popularMap[desire] ?? 0
    const lat = latestMap[desire] ?? 0
    const diff = pop - lat
    if (Math.abs(diff) >= 10) {
      const arrow = diff > 0 ? '▲' : '▼'
      gaps.push(`${desire}: 인기글 ${pop}% vs 최신글 ${lat}% (${arrow}${Math.abs(diff)}%p)`)
    }
  }

  if (gaps.length === 0) return null

  return `\n\n📊 *인기글 vs 최신글 욕망 갭* (10%p+ 차이, 인기글 ${popularPosts.length}건·최신글 ${latestPosts.length}건)\n${gaps.map(g => `• ${g}`).join('\n')}`
}

/** 매거진 추천 Slack 알림 */
async function notifyMagazineTopics(analysis: TrendAnalysis, gapReport: string | null) {
  if (analysis.magazineTopics.length === 0) {
    await notifySlack({
      level: 'important',
      agent: 'TREND_ANALYZER',
      title: '⚠️ 매거진 주제 없음',
      body: `오늘 분석 결과 매거진 추천 주제가 0건입니다.\nhotTopics: ${analysis.hotTopics.length}개 | keywords: ${analysis.keywords.length}개\n→ 오늘 매거진 자동 발행이 되지 않을 수 있습니다.`,
    })
    return
  }

  const topicList = analysis.magazineTopics
    .map((t, i) => `${i + 1}. *${t.title}* (${t.score}/10)\n   └ ${t.reason}`)
    .join('\n\n')

  const hotList = analysis.hotTopics.slice(0, 5)
    .map(t => `• ${t.topic} (${t.count}건, ${t.sentiment})`)
    .join('\n')

  await notifySlack({
    level: 'info',
    agent: 'TREND_ANALYZER',
    title: '오늘의 5060 트렌드 분석',
    body: `🔥 *핫토픽*\n${hotList}\n\n📰 *매거진 주제 추천*\n${topicList}\n\n승인: /magazine\\_approve 1${gapReport ?? ''}`,
  })
}

/** 메인 실행 */
async function main() {
  console.log('[TrendAnalyzer] 시작')
  const startTime = Date.now()

  // 1) 오늘 크롤링 글 조회
  const posts = await getTodayPosts()
  if (posts.length === 0) {
    console.log('[TrendAnalyzer] 오늘 수집된 글 없음 — 스킵')
    await disconnect()
    return
  }

  console.log(`[TrendAnalyzer] ${posts.length}개 글 분석 시작`)

  // 2) Claude AI 분석
  const analysis = await analyzeTrends(posts)
  console.log(`[TrendAnalyzer] 핫토픽 ${analysis.hotTopics.length}개, 키워드 ${analysis.keywords.length}개, 매거진 추천 ${analysis.magazineTopics.length}개`)

  // 3) 개별 글 태깅
  await tagPosts(posts, analysis)

  // 4) 카페별 수집 수 요약
  const cafeSummary: Record<string, number> = {}
  for (const post of posts) {
    cafeSummary[post.cafeId] = (cafeSummary[post.cafeId] ?? 0) + 1
  }

  // 5) 심리 분석 집계 (psych-analyzer가 먼저 실행된 경우에만 데이터 존재)
  const psychData = aggregatePsychData(posts)
  if (psychData.dominantDesire) {
    console.log(`[TrendAnalyzer] 심리 집계 — 지배적 욕망: ${psychData.dominantDesire}, 감정: ${psychData.dominantEmotion}, 긴급토픽: ${psychData.urgentTopics?.length ?? 0}개`)
  } else {
    console.log('[TrendAnalyzer] 심리 분석 데이터 없음 (psych-analyzer 미실행 상태)')
  }

  // 5-1) 말투 학습 집계 (5060 커뮤니티 어휘 + 자주 쓰는 표현)
  const speechTone = aggregateSpeechTone(posts)
  console.log(`[TrendAnalyzer] 말투 집계 — 커뮤니티 어휘 ${speechTone.topCommunityVocab.length}개, 표현 ${speechTone.topKeyPhrases.length}개`)

  // 5-2) 인기글 vs 최신글 욕망 갭 분석
  const gapReport = calcDesireGap(posts)
  if (gapReport) {
    console.log('[TrendAnalyzer] 욕망 갭 분석 완료 (10%p+ 차이 감지)')
  } else {
    console.log('[TrendAnalyzer] 욕망 갭 분석 — 갭 없음 또는 인기글 샘플 부족')
  }

  // 6) DB 저장
  await saveTrend(analysis, posts.length, cafeSummary, psychData, speechTone)

  // 7) Slack 알림 (트렌드 + 갭 리포트)
  await notifyMagazineTopics(analysis, gapReport)

  const durationMs = Date.now() - startTime

  // BotLog — magazineTopics 0건이면 PARTIAL로 기록
  const logStatus = analysis.magazineTopics.length > 0 ? 'SUCCESS' : 'PARTIAL'
  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'TREND_ANALYSIS',
      status: logStatus,
      details: JSON.stringify({
        postsAnalyzed: posts.length,
        hotTopics: analysis.hotTopics.length,
        magazineTopics: analysis.magazineTopics.length,
        parseFailure: analysis.magazineTopics.length === 0,
      }),
      itemCount: analysis.hotTopics.length,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[TrendAnalyzer] 완료 — ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[TrendAnalyzer] 치명적 오류:', err)
  const msg = err instanceof Error ? err.message : String(err)
  const isCreditError = msg.includes('credit balance is too low')
  await notifySlack({
    level: isCreditError ? 'important' : 'critical',
    agent: 'TREND_ANALYZER',
    title: isCreditError ? '🚨 Anthropic 크레딧 소진' : '트렌드 분석 실패',
    body: isCreditError ? '크레딧 잔액 부족 — Plans & Billing에서 충전 필요' : msg,
  })
  await disconnect()
  process.exit(isCreditError ? 0 : 1)
})
