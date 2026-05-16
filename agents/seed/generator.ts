import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { getPersona, getAllPersonaIds, type Persona } from './persona-data.js'
import type { ControversyTopic } from '../core/intelligence.js'
import { parseTopComments, classifyCommentAtmosphere } from '../cafe/types.js'

// ── 욕망 카테고리 → 적합 페르소나 매핑 (v8 — 12카테고리 55명 완전매핑, EN1~EN5 제외) ──
export const DESIRE_PERSONA_MAP: Record<string, { personas: string[]; topicHint: string }> = {
  // HEALTH (6명): 갱년기/증상/병원 중심
  HEALTH:   { personas: ['H', 'A', 'AC', 'R', 'AM', 'AG'],
              topicHint: '건강 정보, 병원 경험, 갱년기 증상 공감, 약 부작용' },
  // FAMILY (6명): 자녀/고부/남편/억울/반전
  FAMILY:   { personas: ['E', 'BC', 'BD', 'K', 'BF', 'BH'],
              topicHint: '자녀 이야기, 고부갈등, 남편 이야기, 손주 자랑, 억울한 상황, 반전 고백' },
  // MONEY (5명): 재테크/연금/절약
  MONEY:    { personas: ['B', 'N', 'AZ', 'AA', 'Y'],
              topicHint: '절약 팁, 재테크, 연금, 물가, ETF, 돈공부' },
  // RETIRE (4명): 은퇴/인생2막
  RETIRE:   { personas: ['T', 'G', 'BA', 'L'],
              topicHint: '은퇴 후 일상, 의미 찾기, 새 시작, 은퇴D100' },
  // JOB (3명): 일자리/자격증/재취업
  JOB:      { personas: ['AT', 'AS', 'D'],
              topicHint: '일자리 경험, 자격증, 재취업, 구직 과정' },
  // RELATION (4명): 공감/소통/친구
  RELATION: { personas: ['C', 'V', 'AD', 'O'],
              topicHint: '공감, 위로, 소통, 친구 이야기, 대화' },
  // HOBBY (7명): 취미/여행/운동/등산
  HOBBY:    { personas: ['M', 'F', 'AB', 'AI', 'AU', 'AW', 'AL'],
              topicHint: '취미, 여행, 텃밭, 등산, 체력관리, 손뜨개, 근육' },
  // MEANING (5명): 삶의의미/철학/감사
  MEANING:  { personas: ['I', 'P', 'AE', 'Q', 'AR'],
              topicHint: '삶의 의미, 감사, 보람, 철학, 요즘세상 단상' },
  // HUMOR (8명): 웃긴일상/황당에피
  HUMOR:    { personas: ['AF', 'AY', 'U', 'X', 'AO', 'AP', 'AX', 'BG'],
              topicHint: '웃긴 일상, 황당 에피소드, 유머, 짤방, 온라인챌린지' },
  // FOOD (3명): 요리/음식/혼밥
  FOOD:     { personas: ['J', 'AQ', 'AV'],
              topicHint: '요리, 음식 이야기, 레시피, 혼밥, 간편요리' },
  // FREEDOM (3명): 독립/혼자여행/자유
  FREEDOM:  { personas: ['S', 'Z', 'AN'],
              topicHint: '혼자 여행, 독립, 자유, 나만의 시간' },
  // CARE (4명): 돌봄/노부모/건강관리
  CARE:     { personas: ['W', 'AH', 'AK', 'AJ'],
              topicHint: '돌봄, 노부모, 건강관리, 간병 경험' },
  // 총 58명 = 6+6+5+4+3+4+7+5+8+3+3+4 (BF/BG/BH 추가, BB 없음, EN1~EN5 별도 처리)
}

/** 오늘의 CafeTrend 조회 (speechTone 포함) */
async function getLatestTrend() {
  try {
    return await prisma.cafeTrend.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        dominantDesire: true,
        dominantEmotion: true,
        urgentTopics: true,
        cafeSummary: true,
        hotTopics: true,
        keywords: true,
        desireMap: true,
        emotionDistribution: true,
      },
    })
  } catch {
    return null
  }
}

/**
 * 실제 CafePost에서 스타일 예시 추출 — "모방" 파이프라인 핵심
 * 페르소나 욕망과 일치하는 카테고리의 실제 커뮤니티 글/댓글 발췌
 */
async function getExampleCafePosts(desire: string | null): Promise<string[]> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const posts = await prisma.cafePost.findMany({
      where: {
        isUsable: true,
        aiAnalyzed: true,
        ...(desire ? { desireCategory: desire } : {}),
        crawledAt: { gte: sevenDaysAgo },
      },
      select: { content: true },
      orderBy: { crawledAt: 'desc' },
      take: 5,
    })
    // 실제 글에서 자연스러운 첫 220자 발췌 (줄바꿈 제거, 빈 문장 제외) — 100자는 스타일 전달 불충분
    return posts
      .map(p => p.content.replace(/<[^>]+>/g, '').replace(/&[a-zA-Z]+;/g, '').replace(/\n+/g, ' ').trim().slice(0, 220))
      .filter(s => s.length > 20)
      .slice(0, 5)
  } catch {
    return []
  }
}

/** 댓글 스타일 예시 — likeCount 정렬 + 대댓글 포함 (베스트 댓글 5개) */
async function getExampleCafeComments(desire: string | null): Promise<string[]> {
  try {
    const posts = await prisma.cafePost.findMany({
      where: {
        isUsable: true,
        aiAnalyzed: true,
        commentCrawled: true,
        ...(desire ? { desireCategory: desire } : {}),
        crawledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { topComments: true },
      orderBy: [{ commentCount: 'desc' }, { crawledAt: 'desc' }],
      take: 10,
    })
    return posts
      .flatMap(p => parseTopComments(p.topComments))
      .filter(c => c.likeCount >= 1 && c.content.length > 10)
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 5)
      .map(c => {
        const reply = c.replies[0]?.content.slice(0, 50) ?? null
        return reply
          ? `${c.content.slice(0, 90)} → 대댓글: "${reply}"`
          : c.content.slice(0, 100)
      })
  } catch {
    return []
  }
}

/** 최근 인기글 댓글 분위기 → 시드봇 글 방향성 컨텍스트 */
async function getCommentAtmosphereContext(desire: string | null): Promise<string> {
  try {
    const posts = await prisma.cafePost.findMany({
      where: {
        isUsable: true,
        commentCrawled: true,
        commentCount: { gte: 5 },
        ...(desire ? { desireCategory: desire } : {}),
        crawledAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      select: { topComments: true, commentCount: true },
      orderBy: { commentCount: 'desc' },
      take: 3,
    })
    if (!posts.length) return ''
    const all = posts.flatMap(p => parseTopComments(p.topComments))
    const atmosphere = classifyCommentAtmosphere(all)
    if (atmosphere === '알수없음') return ''
    const best = all.sort((a, b) => b.likeCount - a.likeCount)[0]
    if (!best) return ''
    const replyHint = best.replies.length > 0 ? ` / 대댓글 ${best.replies.length}개 달린 공감 포인트` : ''
    return `\n\n[최근 커뮤니티 반응 패턴 — 이런 글에 호응이 옴]\n분위기: ${atmosphere} / 베스트 반응: "${best.content.slice(0, 70)}"${replyHint}\n→ 이 분위기에 맞는 소재와 톤으로 글을 써주세요.`
  } catch { return '' }
}

/** 페르소나의 주담당 욕망 카테고리 조회 */
function getPersonaDesire(personaId: string): string | null {
  for (const [desire, info] of Object.entries(DESIRE_PERSONA_MAP)) {
    if (info.personas.includes(personaId)) return desire
  }
  return null
}

// ── 갈등 DNA 변주 엔진 (v12) ──

type VariationType = 'ESCALATION' | 'EMOTIONAL_DEPTH' | 'REVERSAL'

function pickVariationType(): VariationType {
  const r = Math.random()
  if (r < 0.40) return 'ESCALATION'
  if (r < 0.75) return 'EMOTIONAL_DEPTH'
  return 'REVERSAL'
}

async function getTopDNAPost(): Promise<{
  conflictTrigger: string
  betrayalFactor: string | null
  emotionalPeak: string | null
  viralType: string
  commentSplit: number
} | null> {
  try {
    const post = await prisma.cafePost.findFirst({
      where: {
        viralType: { not: null },
        commentSplit: { gte: 6 },
        isUsable: true,
        aiAnalyzed: true,
        crawledAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { commentSplit: 'desc' },
      select: { conflictTrigger: true, betrayalFactor: true, emotionalPeak: true, viralType: true, commentSplit: true },
    })
    if (!post?.conflictTrigger || !post?.viralType) return null
    return {
      conflictTrigger: post.conflictTrigger,
      betrayalFactor: post.betrayalFactor,
      emotionalPeak: post.emotionalPeak,
      viralType: post.viralType,
      commentSplit: post.commentSplit ?? 0,
    }
  } catch {
    return null
  }
}

function buildVariationBlock(
  dna: NonNullable<Awaited<ReturnType<typeof getTopDNAPost>>>,
  variation: VariationType,
): string {
  const baseCtx = `갈등 상황: "${dna.conflictTrigger}"${dna.betrayalFactor ? ` / 배신: "${dna.betrayalFactor}"` : ''}`
  const instructions: Record<VariationType, string> = {
    ESCALATION:      `비슷하지만 더 심했던 내 경험 — 억울함·분노·배신감을 행동·상황으로만 표현 (감정 직접 묘사 금지). "저는 그보다 더했어요..." 식으로 시작`,
    EMOTIONAL_DEPTH: `표면 분노 말고 내면 상처·외로움·섭섭함 — 행동·상황으로 표현 (감정 직접 묘사 금지). "겉으론 웃고 있었는데 속으론..." 식`,
    REVERSAL:        `처음엔 상대 잘못인 줄 알았다가 내 잘못이기도 했던 경험 — "그때는 몰랐는데..." 식 반전`,
  }
  return `\n\n[커뮤니티 화제 참고 — 당신만의 이야기로 자연스럽게 변주]
${baseCtx}
방향: ${instructions[variation]}
규칙:
- 원문 인용/복붙 절대 금지
- 감정("슬펐어요", "화났어요") 직접 묘사 금지 — 행동·상황으로만 표현
- AI 특유의 서론/본론/결론 구조 금지 — 중간에서 바로 시작
- "안녕하세요", "공유드립니다" 등 기계적 인사말 금지`
}

/** 페르소나 욕망 area에 맞는 hotTopic 1개 선택 (Fix 2) */
function selectPersonalizedTopic(
  hotTopics: Array<{ topic: string; area?: string }>,
  persona: Persona,
  personaId: string,
): string | null {
  if (!hotTopics.length) return null

  const desireToArea: Record<string, string> = {
    HEALTH: 'health', FAMILY: 'family', MONEY: 'money',
    RETIRE: 'money', JOB: 'money', RELATION: 'relation',
    HOBBY: 'hobby', MEANING: 'meaning', HUMOR: 'humor', ENTERTAIN: 'humor',
    FOOD: 'hobby', FREEDOM: 'meaning', CARE: 'health',
    BEAUTY: 'hobby', DIGITAL: 'meaning', SPIRITUAL: 'meaning',
    HOUSING: 'money', FASHION: 'hobby', PET: 'relation',
  }
  const personaDesire = getPersonaDesire(personaId)
  const myArea = personaDesire ? desireToArea[personaDesire] : null

  // 1순위: area가 내 욕망과 일치
  if (myArea) {
    const match = hotTopics.find(t => t.area === myArea)
    if (match) return match.topic
  }

  // 2순위: 페르소나 topics 키워드와 겹치는 hotTopic
  const myKeywords = new Set(
    persona.topics.flatMap(t => t.replace(/[~·]/g, ' ').split(/\s+/)).filter(w => w.length >= 2),
  )
  const kwMatch = hotTopics.find(t =>
    t.topic.split(/[\s·,]+/).some(w => w.length >= 2 && myKeywords.has(w)),
  )
  if (kwMatch) return kwMatch.topic

  return null
}

/** 페르소나에게 주입할 오늘의 분위기 컨텍스트 */
function buildTrendContext(
  trend: Awaited<ReturnType<typeof getLatestTrend>>,
  personaId: string,
  persona: Persona,
): string {
  if (!trend?.dominantDesire) return ''

  const urgentTopics = Array.isArray(trend.urgentTopics)
    ? (trend.urgentTopics as Array<{ topic: string; psychInsight: string; count?: number }>)
    : []

  // 이 페르소나의 주담당 욕망
  const personaDesire = getPersonaDesire(personaId)
  const myDesireInfo = personaDesire ? DESIRE_PERSONA_MAP[personaDesire] : null

  // 페르소나 욕망과 같은 카테고리의 긴급 관심사 (구체 소재)
  const matchingUrgent = urgentTopics
    .filter(t => t.topic === personaDesire)
    .map(t => t.psychInsight)
    .filter(Boolean)
    .slice(0, 2)

  // speechTone 데이터
  const summary = trend.cafeSummary as Record<string, unknown> | null
  const keyPhrases = Array.isArray(summary?.topKeyPhrases)
    ? (summary.topKeyPhrases as string[]).slice(0, 5)
    : []
  const communityVocab = Array.isArray(summary?.topCommunityVocab)
    ? (summary.topCommunityVocab as string[]).slice(0, 5)
    : []

  // hotTopics top-7 (Fix 9: area 필드 포함, slice 5→7)
  const hotTopics = Array.isArray(trend.hotTopics)
    ? (trend.hotTopics as Array<{ topic: string; area?: string; count?: number }>)
        .slice(0, 7)
        .map(t => ({ topic: t.topic, area: t.area }))
        .filter(t => Boolean(t.topic))
    : []

  // keywords top-8 단어
  const keywords = Array.isArray(trend.keywords)
    ? (trend.keywords as Array<{ word: string; frequency?: number }>)
        .slice(0, 8)
        .map(k => k.word)
        .filter(Boolean)
    : []

  // desireMap에서 내 욕망 비중
  const desireMap = (trend.desireMap ?? {}) as Record<string, number>
  const myDesirePct = personaDesire && desireMap[personaDesire] != null
    ? `${desireMap[personaDesire]}%`
    : null

  // emotionDistribution top-3
  const emotionDist = (trend.emotionDistribution ?? {}) as Record<string, number>
  const emotionLines = Object.entries(emotionDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${v}%`)

  const myTopicLine = myDesireInfo
    ? `\n- 내 관심 영역 오늘 소재: ${matchingUrgent.length > 0 ? matchingUrgent.join(' / ') : myDesireInfo.topicHint}`
    : ''

  // Fix 2: 60명 전원 동일 → 페르소나 욕망 관련 1개만 (꼭 쓸 필요 없음 안내)
  const personalTopic = selectPersonalizedTopic(hotTopics, persona, personaId)
  const hotTopicLine = personalTopic
    ? `\n- 오늘 커뮤니티에서 이런 이야기도 있어요 (꼭 쓸 필요 없음): ${personalTopic}`
    : ''

  const emotionLine = emotionLines.length > 0
    ? `\n- 감정 흐름: ${trend.dominantEmotion ?? '다양함'} (${emotionLines.join(', ')})`
    : `\n- 감정 흐름: ${trend.dominantEmotion ?? '다양함'}`

  const vocabLine = (keyPhrases.length + communityVocab.length + keywords.length > 0)
    ? [
        keyPhrases.length > 0 ? `\n- 오늘 유행 표현: ${keyPhrases.join(', ')}` : '',
        (communityVocab.length + keywords.length > 0)
          ? `\n- 자주 쓰는 어휘: ${[...communityVocab, ...keywords].slice(0, 8).join(', ')}`
          : '',
      ].join('')
    : ''

  const desirePctLine = myDesirePct
    ? `\n- 내 욕망 영역 오늘 비중: ${personaDesire} ${myDesirePct}`
    : ''

  return `
[오늘 커뮤니티 말투·어휘 — 적극 모방하세요]
- 오늘 주된 관심: ${personaDesire ?? trend.dominantDesire} 관련 이야기${myTopicLine}${hotTopicLine}${emotionLine}${vocabLine}${desirePctLine}

위의 "오늘 유행 표현"과 "자주 쓰는 어휘"는 실제 우갱 회원들이 오늘 쓴 말입니다.
이 단어와 표현 방식을 당신 글에 자연스럽게 녹여 쓰세요.
내용 직접 인용은 금지, 말투와 어휘 스타일만 따라하세요.`
}

/** 상위 18명 페르소나 — Sonnet 사용 (글 품질 우선 + 킬러 댓글 논란형 포함) */
const HEAVY_PERSONAS = new Set([
  'A', 'E', 'H', 'B', 'M', 'F', 'I', 'G', 'J', 'AJ',  // 기존 10명
  'BF', 'BG', 'BH', 'BC', 'BD',                         // 논란/반전형 5명
  'U', 'V', 'W',                                          // 황당/현실형 3명
])

function getModelForPersona(personaId: string): string {
  return HEAVY_PERSONAS.has(personaId)
    ? (process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-5')
    : (process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5')
}

const client = new Anthropic()

/** KST 현재 시간대별 분위기 힌트 (Fix 10) */
function getTimeOfDayMood(kstHour: number): string {
  if (kstHour >= 9 && kstHour <= 11)  return '상쾌한 아침, 활기차게 하루 시작'
  if (kstHour >= 12 && kstHour <= 13) return '여유로운 점심 시간'
  if (kstHour >= 14 && kstHour <= 17) return '한가로운 오후'
  if (kstHour >= 18 && kstHour <= 20) return '하루를 마무리하는 저녁'
  if (kstHour >= 21 && kstHour <= 22) return '조용한 밤, 오늘을 돌아보는 시간'
  if (kstHour === 0 || kstHour === 1)  return '잠 못 드는 깊은 밤, 감성이 차오르는 시간'
  return ''
}

/** KST 현재 날짜/요일/시간대 문자열 (GitHub Actions UTC 실행 보정) */
function getKstContext(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const day = days[kst.getUTCDay()]
  const hour = kst.getUTCHours()
  const timeSlot = hour < 6 ? '새벽' : hour < 12 ? '오전' : hour < 18 ? '오후' : '저녁'
  return `[KST 현재] ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${day} ${timeSlot}\n글에서 날짜/요일/시간대를 언급할 때 반드시 위 기준으로 쓰세요.`
}

/** HUMOR 보드 글 생성 시 최근 엔터테인먼트 크롤링 글 조회 */
async function getLatestEntertainPost(): Promise<{ title: string; content: string } | null> {
  try {
    // KST 오늘 자정을 UTC로 변환
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const startOfTodayKST = new Date(nowKST)
    startOfTodayKST.setUTCHours(0, 0, 0, 0)
    const startOfTodayUTC = new Date(startOfTodayKST.getTime() - 9 * 60 * 60 * 1000)
    const sevenDaysAgoUTC = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // 오늘 크롤링 글 우선, 없으면 최근 7일 fallback
    for (const since of [startOfTodayUTC, sevenDaysAgoUTC]) {
      const post = await prisma.cafePost.findFirst({
        where: {
          isUsable: true,
          crawledAt: { gte: since },
          OR: [
            { desireCategory: 'ENTERTAIN' },
            { topics: { hasSome: ['드라마', '예능', '연예인', '트로트', '넷플릭스', '임영웅'] } },
          ],
        },
        orderBy: { crawledAt: 'desc' },
        select: { title: true, content: true },
      })
      if (post) return post
    }
    return null
  } catch {
    return null
  }
}

/** AI 응답에서 마크다운 문법 제거 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')          // ```code blocks```
    .replace(/#{1,6}\s?/g, '')               // ## headings
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')     // **bold** (줄바꿈 포함)
    .replace(/\*([\s\S]+?)\*/g, '$1')         // *italic*
    .replace(/__([\s\S]+?)__/g, '$1')         // __bold__
    .replace(/_([\s\S]+?)_/g, '$1')           // _italic_
    .replace(/~~([\s\S]+?)~~/g, '$1')         // ~~strike~~
    .replace(/`(.+?)`/g, '$1')               // `code`
    .replace(/^[-*+]\s/gm, '')               // list bullets
    .replace(/^\d+\.\s/gm, '')               // 1. numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/\*+/g, '')                     // 나머지 * 일괄 제거
    .replace(/_{2,}/g, '')                   // 나머지 __ 일괄 제거
    .trim()
}

// re-export for scheduler.ts
export { getAllPersonaIds, getPersona }

/** 제목 목록에서 중복 소재 키워드 추출 — 2회 이상 등장 한국어 명사 (2~4글자) */
function extractTopicKeywords(titles: string[]): string[] {
  const stopwords = new Set([
    '있어요', '없어요', '했어요', '좋아요', '같아요', '것들', '이번', '요즘',
    '오늘', '어제', '그냥', '너무', '진짜', '정말', '그래서', '하지만',
    '그런데', '드디어', '우리가', '이게', '이런', '저도', '나도', '다들',
    '아직', '벌써', '이미', '내가', '우리', '모두', '어떻게', '하나',
    '이제', '여기', '저기', '가장', '조금', '많이', '갑자기', '결국',
    '처음', '나중', '마지막', '이렇게', '저렇게', '그렇게', '지금', '다시',
  ])
  const allText = titles.join(' ')
  const words = allText.match(/[가-힣]{2,4}/g) ?? []
  const freq = new Map<string, number>()
  for (const w of words) {
    if (!stopwords.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([word]) => word)
}

/** 글 길이 다양화 — 짧은/보통/긴 글 랜덤 선택 (HEAVY 페르소나는 30% 확률로 에세이형 가능) */
const POST_LENGTHS = [
  { instruction: '60~120자, 짧고 가벼운 1문단', maxTokens: 350 },
  { instruction: '150~280자, 2~3문장으로 나눠서', maxTokens: 700 },
  { instruction: '280~450자, 에세이형 3~4문단, 구체적 상황 묘사 포함', maxTokens: 1100 },
]

function pickPostLength(personaId: string) {
  if (HEAVY_PERSONAS.has(personaId) && Math.random() < 0.30) {
    return POST_LENGTHS[2]
  }
  return POST_LENGTHS[Math.floor(Math.random() * 2)]
}

/** 페르소나별 강화된 시스템 프롬프트 생성 */
// 클러스터별 오타/표현 패턴 (wgang + dlxogns01 실제 게시물 40개 분석 기반)
const TYPO_CLUSTER: Record<string, string[]> = {
  SENTI:  ['A', 'C', 'E', 'G', 'K', 'M', 'Q', 'S'],  // 감성/수다형
  HEALTH: ['H', 'AC', 'R', 'W'],                        // 건강염려형
  HUMOR:  ['AF', 'U', 'AY', 'X'],                       // 유머/방언형
  // 나머지: 정보/은퇴형 (B, N, T, BA, AZ 등)
}

function buildTypoInstruction(p: Persona, personaId: string): string {
  if (!p.quirks.some(q => q.includes('맞춤법') || q.includes('오타'))) return ''

  if (TYPO_CLUSTER.SENTI.includes(personaId)) return `

[자연스러운 표현 — 3개 중 1개에 아래 중 하나 자연스럽게 포함]
- "너무" 대신 "넘" / "우리" 대신 "울"
- 말줄임 ".." (어떡하죠.. / 힘드네요..)
- "ㅠ" 1개 문장 끝
- 띄어쓰기 한 군데 자연스럽게 생략
억지 표현 금물.`

  if (TYPO_CLUSTER.HEALTH.includes(personaId)) return `

[건강 걱정글 특유 표현 — 3개 중 1개에 아래 중 하나 자연스럽게 포함]
- 문장 끝 ".." (별거 아니겠죠.. / 어디 가서 물어봐야 하나..)
- "ㅠㅠ" 1개 이하
- 짧게 끊기 ("병원 가야 하나. 아니 그냥 두나. 모르겠다.")
- 의문형 마무리 ("이런 거 겪어보신 분 있어요?")
억지 과장 금물.`

  if (TYPO_CLUSTER.HUMOR.includes(personaId)) return `

[유머/방언 표현 — 3개 중 1개에 아래 중 하나 자연스럽게 포함]
- 경상도식 표현 중 하나: "카기가", "캐많노ㅋ", "야이야"
- 또는 띄어쓰기 생략 ("이게저한테", "왜갑자기")
- 또는 "ㅋ" 1개 단독
하나만 선택, 전부 쓰지 말 것.`

  // 정보/은퇴형
  return `

[정보글 자연스러운 표현 — 3개 중 1개에 아래 중 하나 자연스럽게 포함]
- 인터넷/앱 오기: "유투"(유튜브), "챗Gpt"
- 또는 한자어 음운 혼동: "북구"(복구), "게산기"(계산기) — 주제와 맞을 때만
- 또는 격식체 돌출: 구어체 중간에 "~사료됩니다" 1회
어색하면 생략.`
}

/** 지금 이 순간의 상황으로 페르소나 묘사 — 캐릭터 카드 레이블 대신 즉석 임베딩 */
function buildSituationLine(p: Persona, kstHour: number): string {
  const timeDesc = kstHour < 12 ? '오전' : kstHour < 18 ? '오후' : '저녁'
  const moodDesc = {
    positive:  '밝고 긍정적',
    neutral:   '담담하고 감정을 잘 드러내지 않는',
    negative:  '불만 많고 걱정 많은',
    mixed:     '때론 밝고 때론 현실적인',
  }
  const TRIGGER_MOMENTS = [
    '방금 있었던 일이 머릿속에서 안 떠나서',
    '이거 나만 그런가 싶어서 물어보고 싶어서',
    '하소연 좀 해야겠다 싶어서',
    '누군가한테 말하고 싶었는데 마땅한 곳이 없어서',
    '비슷한 경험 있는 분 있는지 궁금해서',
    '혼자 생각하다 답이 안 나와서',
    '오늘 있었던 일 기록해두고 싶어서',
    '자꾸 신경 쓰여서 일단 써놓고 싶어서',
  ]
  const trigger = TRIGGER_MOMENTS[Math.floor(Math.random() * TRIGGER_MOMENTS.length)]
  return `지금 이 순간: ${p.age}세 ${p.gender}성 "${p.nickname}"이 ${timeDesc}에 스마트폰으로 커뮤니티에 글을 쓰는 중.
글 쓰는 이유: ${trigger}.
성격: ${p.personality} ${moodDesc[p.mood]} 편.
말투: ${p.speech_patterns.join(', ')}
절대 안 하는 것: ${p.never.join(' / ')}`
}

/** 컨텍스트별 핵심 규칙 — 금지 목록 나열 대신 무엇을 해야 하는지 명시 */
function buildContextRule(context: 'post' | 'comment' | 'reply'): string {
  if (context === 'post') {
    return `원글을 쓴다. 내 이야기로 시작 ("오늘", "어제", "요즘", "우리 집"). 결론 내리지 않기, 레시피 나열 금지, "안녕하세요" 금지, !! 2개 이상 금지, 마크다운 금지, 오프라인 모임 모집 금지.`
  }
  if (context === 'comment') {
    return `댓글을 단다. 1~2문장. 글에서 구체적인 것 하나("설악산 다녀오셨군요" / "딸이 허전하시겠다") 집어서 반응. "맞아요 저도 그런 경험이 있어요" / "공감이 너무 돼요" / "위로가 됩니다" 패턴 절대 금지. 자기 경험 한 줄 붙여도 좋음. 마크다운 금지.`
  }
  return `대댓글 1문장. 나는 이 글의 글쓴이가 아닌 다른 독자다. 글쓴이 입장에서 감사·응답하지 말 것. 상대 댓글 핵심 단어 하나 집기. "감사합니다" / "고마워요" / "감사해요" 절대 금지. 자연스러운 제3자 맞장구: "그쵸 ㅠ" / "맞아요ㅋ" / "저도 그런 경험". 마크다운 금지.`
}

function buildSystemPrompt(p: Persona, personaId: string, context: 'post' | 'comment' | 'reply'): string {
  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
  const timeMood = getTimeOfDayMood(kstHour)
  const lateNightExtra = (kstHour === 0 || kstHour === 1)
    ? `\n\n잠 못 드는 깊은 밤. 혼자 쓰는 일기처럼. 외로움, 그리움, 회상. 짧고 솔직하게.`
    : ''
  const timeMoodLine = timeMood ? `\n현재 시간대: ${timeMood}` : ''

  const quirksStr = p.quirks.map(q => `- ${q}`).join('\n')
  const examplesStr = p.examples.map(e => `"${e}"`).join('\n')
  const typoInstruction = buildTypoInstruction(p, personaId)
  const situationLine = buildSituationLine(p, kstHour)
  const contextRule = buildContextRule(context)

  return `${situationLine}

글쓰기 습관:
${quirksStr}${typoInstruction}
평소 이런 글을 쓴다:
${examplesStr}

지금 할 일: ${contextRule}
"시니어"/"액티브 시니어" 금지. 정치/종교/혐오/광고 금지. 드라마/예능 언급 시 실제 제목 명시. 예시 문장 그대로 복사 금지.${timeMoodLine}${lateNightExtra}`
}

/** 글 생성 */
export async function generatePost(
  personaId: string,
  boardOverride?: string,
  controversySeed?: ControversyTopic,
): Promise<{ title: string; content: string; boardType: string; category?: string; variationType?: VariationType }> {
  const p = getPersona(personaId)
  const board = boardOverride ?? p.board
  const topic = p.topics.length > 0
    ? p.topics[Math.floor(Math.random() * p.topics.length)]
    : '일상'

  const categoryMap: Record<string, string[]> = {
    STORY: ['건강', '가족', '취미', '고민', '자유수다'],
    HUMOR: ['유머·웃음', '엔터·TV', '추천·리뷰', '기타'],
    JOB: ['전체'],
    LIFE2: ['은퇴준비', '재테크·연금', '보험', '주거·이사'],
    WEEKLY: ['은퇴준비', '재테크·연금', '보험', '주거·이사'],  // WEEKLY 숨김 — LIFE2와 동일 카테고리
  }
  const boardCategories = categoryMap[board] ?? ['기타']

  const length = pickPostLength(personaId)

  // 오늘의 CafeTrend 심리 프로파일 주입
  const trend = await getLatestTrend()
  const trendContext = buildTrendContext(trend, personaId, p)

  // Fix 13-D: controversy 시드 있을 때 논쟁 체인 글 유도
  const controversyBlock = controversySeed
    ? `\n\n[오늘 커뮤니티 화제 유형 — 이런 상황 경험 글 써주세요]
유형: ${controversySeed.controversyType}
분위기: "${controversySeed.seedContent}"
- "저만 이런 건가요?", "여러분은 어떻게 생각하세요?" 식 열린 결말
- 직접 인용 금지, 본인 경험처럼 자연스럽게`
    : ''

  // HUMOR 보드: 최근 엔터 크롤링 글에서 프로그램명/연예인명 힌트 추출
  let entertainHint = ''
  if (board === 'HUMOR') {
    const entertainPost = await getLatestEntertainPost()
    if (entertainPost) {
      entertainHint = `\n\n[오늘 화제 엔터 소재 — 이 글을 참고해 구체적 프로그램명/연예인명 사용]\n제목: ${entertainPost.title}\n${entertainPost.content.slice(0, 200)}`
    }
  }

  // 이전 게시 이력 + 오늘 봇 전체 발행 소재 조회 — 중복 주제 방지 (실패해도 글 생성 계속)
  let recentHint = ''
  try {
    const [recentPosts, todayBotPosts] = await Promise.all([
      prisma.post.findMany({
        where: { author: { email: `bot-${personaId.toLowerCase()}@unao.bot` } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { title: true },
      }),
      prisma.post.findMany({
        where: {
          author: { email: { endsWith: '@unao.bot' } },
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        select: { title: true },
        take: 30,
      }),
    ])
    if (recentPosts.length > 0) {
      recentHint = `\n\n[최근 쓴 글들 — 이 주제들과 완전히 다른 소재로 써주세요]\n` +
        recentPosts.map(r => `- ${r.title}`).join('\n')
    }
    const todayKeywords = extractTopicKeywords(todayBotPosts.map(r => r.title))
    if (todayKeywords.length > 0) {
      recentHint += `\n오늘 이미 나온 소재 (반드시 피하세요): ${todayKeywords.join(', ')}`
    }
  } catch {
    // 조회 실패 시 글 생성은 계속
  }

  // 실제 CafePost 예시 — 말투 모방 (글 생성)
  const desire = getPersonaDesire(personaId)
  const examples = await getExampleCafePosts(desire)
  const exampleBlock = examples.length > 0
    ? `\n\n[실제 우갱 회원 글 말투 — 이 스타일로 쓰세요, 내용 인용 절대 금지]\n` +
      examples.map(e => `"${e}"`).join('\n')
    : ''
  // 댓글 분위기 컨텍스트 — DEEP 모드 글 있을 때만 채워짐
  const atmosphereContext = await getCommentAtmosphereContext(desire)

  // 변주 엔진 — FAMILY/RELATION/CARE/HEALTH 페르소나 + 40% 확률 (controversySeed 없을 때만)
  const DNA_ELIGIBLE_DESIRES = ['FAMILY', 'RELATION', 'CARE', 'HEALTH']
  let variationType: VariationType | undefined
  let variationBlock = ''
  if (!controversySeed && desire && DNA_ELIGIBLE_DESIRES.includes(desire) && Math.random() < 0.40) {
    const dna = await getTopDNAPost()
    if (dna) {
      variationType = pickVariationType()
      variationBlock = buildVariationBlock(dna, variationType)
    }
  }

  if (process.env.DRY_RUN === 'true') {
    return {
      title: `${p.nickname} — ${variationType ? `[${variationType}] ` : ''}${topic}`,
      content: `[DRY_RUN] personaId=${personaId} desire=${desire ?? 'null'} board=${board} variationType=${variationType ?? 'none'}\n변주블록:${variationBlock || '(없음)'}`,
      boardType: board,
      category: boardCategories[0],
      variationType,
    }
  }

  const response = await client.messages.create({
    model: getModelForPersona(personaId),
    max_tokens: length.maxTokens,
    system: getKstContext() + '\n\n' + buildSystemPrompt(p, personaId, 'post') + trendContext,
    messages: [{
      role: 'user',
      content: `오늘 "${topic}" 주제로 커뮤니티 글 하나만 써줘.${entertainHint}${recentHint}${exampleBlock}${atmosphereContext}${controversyBlock}${variationBlock}

글이 시작되는 순간이 중요해: 지금 막 어떤 일이 있었거나 어떤 생각이 떠올라서 바로 그 장면부터 써줘. "오늘", "아까", "방금", "요즘"으로 바로 시작.
제목도 반드시 "오늘", "아까", "진짜", "어휴", "요즘", "방금"으로 시작하는 현장감 있는 구어체로.
첫 줄에 제목 (구어체, 15~25자), 빈 줄 하나, 그 다음 본문 (${length.instruction}).
제목/카테고리/본문 레이블 붙이지 말 것.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  // 폼 양식 제거 — 첫 줄 = 제목, 나머지 = 본문으로 파싱
  const lines = text.trim().split('\n')
  const rawTitle = lines[0]?.trim() ?? ''
  const rawBody = lines.slice(1).join('\n').replace(/^\n+/, '').trim()
  // 카테고리는 AI 선택 제거 → 해당 게시판 카테고리 중 랜덤 배정
  const validCategory = boardCategories[Math.floor(Math.random() * boardCategories.length)]

  return {
    title: stripMarkdown(rawTitle || `${p.nickname}의 일상`)
      .replace(/^\*+\s?/, '').replace(/\s?\*+$/, '').trim(),
    content: stripMarkdown(rawBody || text),
    boardType: board,
    category: validCategory,
    variationType,
  }
}

/** 킬러 포스트 생성 — CafePost 원문 95% 유지, 어미·익명화 5%만 변형 */
export async function generateKillerPost(
  cafePost: {
    id: string
    title: string
    content: string
    desireCategory: string | null
  },
  personaId: string,
): Promise<{ title: string; content: string; boardType: string; cafePostId: string }> {
  const p = getPersona(personaId)
  const trend = await getLatestTrend()
  const trendContext = buildTrendContext(trend, personaId, p)
  const system = getKstContext() + '\n\n' + buildSystemPrompt(p, personaId, 'post') + trendContext

  const userMessage = `아래 원문을 우나어 커뮤니티에 내 이름으로 올릴 수 있게 옮겨줘.
이 글을 쓴 사람인 것처럼 자연스럽게.

[원문 제목]: ${cafePost.title}
[원문 본문]:
${cafePost.content}

■ 반드시 유지 (95%):
  - 이야기 전개 순서와 구조 (앞뒤 바꾸기 금지)
  - 갈등·배신·황당함·억울함·반전 포인트 (이게 핵심)
  - 감정 흐름의 아크 (분노→허탈, 기대→실망 등)
  - 결말과 현재 감정 상태
  - 핵심 대사, 상황 묘사, 숫자/금액 등 구체적 사실

■ 바꿔도 되는 것 (5%):
  - 첫 문장 시작 표현 1개 ("오늘", "아까", "진짜", "어휴")
  - 지명·인명·직장명 → 익명화 ("OO구", "남편", "회사")
  - 페르소나 말투 어미 1~2개 교체

■ 절대 금지:
  - 새 에피소드·반전 추가 금지
  - 교훈·조언·맺음말 새로 붙이기 금지
  - 내용 압축·요약 금지 (원문과 비슷한 분량 유지)
  - AI답게 정리·구조화 금지

출력: 제목(15~25자) → 빈줄 → 본문. 레이블 없음.`

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-5',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const lines = raw.split('\n')
  const title = stripMarkdown(lines[0].replace(/^[#*\-•]+\s*/, '').trim()).slice(0, 50)
  const content = lines.slice(2).join('\n').trim()
  const boardType = killerDesireToBoardType(cafePost.desireCategory)

  return { title, content, boardType, cafePostId: cafePost.id }
}

function killerDesireToBoardType(desire: string | null): string {
  if (desire === 'HUMOR' || desire === 'ENTERTAIN') return 'HUMOR'
  return 'STORY'
}

/** 킬러 댓글 생성 — CafePost topComments 99% 유지, 어미 1개만 변형 */
export async function generateKillerComments(
  cafePost: {
    id: string
    title: string
    topComments: unknown
  },
  personaIds: string[],
): Promise<Array<{ personaId: string; content: string }>> {
  const rawComments = (cafePost.topComments as Array<{
    content: string
    likeCount?: number
  }> | null) ?? []

  if (rawComments.length === 0) return []

  const topN = rawComments
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, Math.min(personaIds.length, 10))

  const userMessage = `아래 원문 댓글들을 각각 다른 사람이 쓴 것처럼 99% 그대로 옮겨줘.

[글 제목]: ${cafePost.title}
[원문 댓글 ${topN.length}개]:
${topN.map((c, i) => `${i + 1}. ${c.content}`).join('\n')}

■ 유지 (99%):
  - 댓글 핵심 내용, 공감/반감 방향
  - 논란 포인트, 핵심 단어, 감탄사

■ 바꿔도 되는 것 (1% 이내, 댓글 1개당 1가지만):
  - 어미 1개 교체 (-아 → -아요, -네 → -네요)
  - 감탄사 1개 교체 (ㅠㅠ↔ㅜㅜ, 어머→아이고, 진짜→정말)

■ 절대 금지: 내용 추가, 공감 방향 변경, 새 의견 삽입, 압축

출력: 번호 없이 변환된 댓글만, 한 줄씩, 정확히 ${topN.length}줄`

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5',
    max_tokens: 600,
    system: '댓글을 최소한만 변형하여 자연스럽게 옮겨 쓰는 역할. 내용 추가 절대 금지.',
    messages: [{ role: 'user', content: userMessage }],
  })

  const lines = (response.content[0].type === 'text' ? response.content[0].text : '')
    .trim()
    .split('\n')
    .map(l => l.replace(/^\d+\.\s*/, '').trim())
    .filter(l => l.length > 0)
    .slice(0, topN.length)

  return lines.map((content, i) => ({
    personaId: personaIds[i] ?? personaIds[0],
    content,
  }))
}

/** 댓글 생성 */
export async function generateComment(
  personaId: string,
  postTitle: string,
  postContent: string,
): Promise<string> {
  const p = getPersona(personaId)

  // 오늘 커뮤니티 말투·어휘 주입 (글 생성과 동일 수준)
  const trend = await getLatestTrend()
  const trendContext = buildTrendContext(trend, personaId, p)

  // Fix 5: 게시글 예시(content) → 실제 댓글(topComments) 예시로 교체
  const desire = getPersonaDesire(personaId)
  const commentExamples = await getExampleCafeComments(desire)
  const exampleBlock = commentExamples.length > 0
    ? `\n\n[실제 우갱 회원 댓글 예시 — 이 길이와 톤으로 댓글 쓰세요, 내용 인용 절대 금지]\n` +
      commentExamples.map(e => `"${e}"`).join('\n')
    : ''

  // 이전 댓글 이력 조회 — 첫 문장·표현 반복 방지
  let recentCommentHint = ''
  try {
    const recentComments = await prisma.comment.findMany({
      where: {
        author: { email: `bot-${personaId.toLowerCase()}@unao.bot` },
        parentId: null,  // 대댓글 제외, 댓글만
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    })
    if (recentComments.length > 0) {
      recentCommentHint = `\n\n[최근 단 댓글들 — 다른 첫 문장·표현으로 시작하세요]\n` +
        recentComments.map(c => `- "${c.content.slice(0, 60)}"`).join('\n')
    }
  } catch {
    // 조회 실패 시 댓글 생성 계속
  }

  const response = await client.messages.create({
    model: getModelForPersona(personaId),
    max_tokens: 200,
    system: getKstContext() + '\n\n' + buildSystemPrompt(p, personaId, 'comment') + trendContext,
    messages: [{
      role: 'user',
      content: `다음 글에 댓글을 달아주세요.\n\n제목: ${postTitle}\n내용: ${postContent.slice(0, 300)}${exampleBlock}${recentCommentHint}`,
    }],
  })

  const comment = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return stripMarkdown(comment)
}

/** 시트 화제성 파동 댓글 생성 — Sonnet 모델, 본문 맥락 반영, 키워드 검증 포함 */
export async function generateSheetViralComment(
  personaId: string,
  postTitle: string,
  rawContent: string,
  waveType: 'empathy' | 'critical' | 'reversal',
  keyTerms: string[],
  sourceComments: string[] = [],
): Promise<string> {
  // ── 이미지 전용 글 감지: HTML 태그 제거 후 텍스트 50자 미만이면 AI 호출 스킵 ──
  const cleanText = rawContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (cleanText.length < 50) {
    console.log(`  [SheetViral] 본문 텍스트 부족 (${cleanText.length}자) — 이미지 전용 글 댓글 스킵`)
    return ''
  }
  // ─────────────────────────────────────────────────────────────────────────────
  const p = getPersona(personaId)

  const WAVE_PROMPTS = {
    empathy: `이 글에서 가장 감정이입되는 부분에 구체적으로 공감해주세요.
글의 상황(인물명/사건)을 직접 언급하며 반응하세요.
따뜻하되 과하게 칭찬하지 말고, 본인 경험 한 줄 곁들이세요.`,
    critical: `이 글에서 한 가지만 솔직하게 다른 시각으로 봐주세요.
"근데 저는 솔직히..." "이게 꼭 맞는 건지 모르겠어요" 수준.
공격적이지 않게, 조심스럽게. 글의 구체적 상황을 언급하며.`,
    reversal: `이 글을 읽으며 묵직하게 느낀 감정이나 비슷한 경험을 짧게 써주세요.
결론 짓지 말고 여운을 남기세요.
"사실은 저도..." "이런 게 어디 한두 집 일이겠어요" 수준.`,
  }

  const systemPrompt = `당신은 이 글을 읽은 50~60대 한국 여성입니다.
글에서 구체적으로 언급된 상황(인물, 사건, 감정 포인트)을 댓글에 반드시 반영하세요.
"저도 비슷한 경험이 있어요" 같은 막연한 공감은 금지.
글에서 구체적 단어가 나왔다면 댓글에도 포함하세요.

[자연스러운 말투 지시]
- 문장이 끊겨도 됩니다 (짧은 반응도 OK)
- 가끔 ㅎ ㅋ ㅠ 이모티콘 자연스럽게 사용
- 완벽한 문장 구조 피하기 (실제 댓글은 비문이 많음)
- 1문장~3문장 사이, 랜덤 길이

[페르소나] ${p.nickname} (${p.age}세, ${p.personality.slice(0, 80)})

[댓글 방향]
${WAVE_PROMPTS[waveType]}`

  const commentContext = sourceComments.length > 0
    ? `\n\n[원본 커뮤니티 댓글 분위기 참고 — 상스러운 표현은 순화하고, 50~60대 말투로 재작성]\n${sourceComments.slice(0, 5).join('\n')}`
    : ''

  const maxAttempts = 2
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6',
      max_tokens: 200,
      system: getKstContext() + '\n\n' + systemPrompt,
      messages: [{
        role: 'user',
        content: `다음 글에 댓글을 달아주세요.${commentContext}\n\n제목: ${postTitle}\n\n본문:\n${rawContent.slice(0, 1500)}`,
      }],
    })

    const comment = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const cleaned = stripMarkdown(comment)

    // 키워드 검증: 핵심 단어 1개 이상 포함 여부
    const hasKeyTerm = keyTerms.length === 0 || keyTerms.some(term => cleaned.includes(term))
    if (hasKeyTerm || attempt === maxAttempts - 1) {
      return cleaned
    }
  }

  return ''
}

/** 대댓글(답글) 생성 */
export async function generateReply(
  personaId: string,
  postTitle: string,
  commentContent: string,
): Promise<string> {
  const p = getPersona(personaId)

  // 오늘 커뮤니티 말투 주입 (어휘 모방 유지)
  const trend = await getLatestTrend()
  const trendContext = buildTrendContext(trend, personaId, p)

  const response = await client.messages.create({
    model: getModelForPersona(personaId),
    max_tokens: 150,
    system: buildSystemPrompt(p, personaId, 'reply') + trendContext,
    messages: [{
      role: 'user',
      content: `글 제목: ${postTitle}\n이 댓글에 답글을 달아주세요: "${commentContent.slice(0, 200)}"`,
    }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return stripMarkdown(reply)
}

/** 페르소나 ID 기반 결정론적 grade 배정 — 60명이 🌱/🌿/☀️ 고르게 분포 */
function getBotGrade(personaId: string): 'SPROUT' | 'REGULAR' | 'WARM_NEIGHBOR' {
  const sum = personaId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const grades: ('SPROUT' | 'REGULAR' | 'WARM_NEIGHBOR')[] = ['SPROUT', 'REGULAR', 'WARM_NEIGHBOR']
  return grades[sum % 3]
}

/** 봇 유저 조회 또는 생성 (닉네임·grade 변경 시 자동 업데이트) */
export async function getBotUser(personaId: string): Promise<string> {
  const p = getPersona(personaId)
  const email = `bot-${personaId.toLowerCase()}@unao.bot`
  const grade = getBotGrade(personaId)

  const user = await prisma.user.upsert({
    where: { email },
    update: { nickname: p.nickname, grade },
    create: {
      email,
      nickname: p.nickname,
      providerId: `bot-${personaId.toLowerCase()}`,
      role: 'USER',
      grade,
    },
  })
  return user.id
}
