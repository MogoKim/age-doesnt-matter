import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { getPersona, getAllPersonaIds, type Persona } from './persona-data.js'
import type { ControversyTopic } from '../core/intelligence.js'

// ── 욕망 카테고리 → 적합 페르소나 매핑 (v8 — 12카테고리 55명 완전매핑, EN1~EN5 제외) ──
export const DESIRE_PERSONA_MAP: Record<string, { personas: string[]; topicHint: string }> = {
  // HEALTH (6명): 갱년기/증상/병원 중심
  HEALTH:   { personas: ['H', 'A', 'AC', 'R', 'AM', 'AG'],
              topicHint: '건강 정보, 병원 경험, 갱년기 증상 공감, 약 부작용' },
  // FAMILY (4명): 자녀/고부/남편
  FAMILY:   { personas: ['E', 'BC', 'BD', 'K'],
              topicHint: '자녀 이야기, 고부갈등, 남편 이야기, 손주 자랑' },
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
  // HUMOR (7명): 웃긴일상/황당에피
  HUMOR:    { personas: ['AF', 'AY', 'U', 'X', 'AO', 'AP', 'AX'],
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
  // 총 55명 = 6+4+5+4+3+4+7+5+7+3+3+4 (BB 없음, EN1~EN5 별도 처리)
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
    // 실제 글에서 자연스러운 첫 100자 발췌 (줄바꿈 제거, 빈 문장 제외)
    return posts
      .map(p => p.content.replace(/\n+/g, ' ').trim().slice(0, 100))
      .filter(s => s.length > 20)
      .slice(0, 3)
  } catch {
    return []
  }
}

/** 댓글 스타일 예시 — CafePost.topComments에서 실제 댓글 발췌 (Fix 5) */
async function getExampleCafeComments(desire: string | null): Promise<string[]> {
  try {
    const posts = await prisma.cafePost.findMany({
      where: {
        isUsable: true,
        aiAnalyzed: true,
        ...(desire ? { desireCategory: desire } : {}),
        crawledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { topComments: true },
      orderBy: { crawledAt: 'desc' },
      take: 10,
    })
    return posts
      .flatMap(p => (p.topComments as Array<{ content: string }> | null) ?? [])
      .map(c => c.content.slice(0, 80))
      .filter(s => s.length > 10)
      .slice(0, 3)
  } catch {
    return []
  }
}

/** 페르소나의 주담당 욕망 카테고리 조회 */
function getPersonaDesire(personaId: string): string | null {
  for (const [desire, info] of Object.entries(DESIRE_PERSONA_MAP)) {
    if (info.personas.includes(personaId)) return desire
  }
  return null
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
    HOBBY: 'hobby', MEANING: 'meaning', HUMOR: 'humor',
    FOOD: 'hobby', FREEDOM: 'meaning', CARE: 'health',
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
- 오늘 주된 관심: ${trend.dominantDesire} 관련 이야기${myTopicLine}${hotTopicLine}${emotionLine}${vocabLine}${desirePctLine}

위의 "오늘 유행 표현"과 "자주 쓰는 어휘"는 실제 우갱 회원들이 오늘 쓴 말입니다.
이 단어와 표현 방식을 당신 글에 자연스럽게 녹여 쓰세요.
내용 직접 인용은 금지, 말투와 어휘 스타일만 따라하세요.`
}

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

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
    .replace(/#{1,6}\s?/g, '')         // ## headings
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g, '$1')       // *italic*
    .replace(/__(.+?)__/g, '$1')       // __bold__
    .replace(/_(.+?)_/g, '$1')         // _italic_
    .replace(/~~(.+?)~~/g, '$1')       // ~~strike~~
    .replace(/`(.+?)`/g, '$1')         // `code`
    .replace(/^[-*+]\s/gm, '')         // list bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/\*+/g, '')                     // 나머지 * /** 일괄 제거
    .trim()
}

// re-export for scheduler.ts
export { getAllPersonaIds, getPersona }

/** 글 길이 다양화 — 짧은/보통/긴 글 랜덤 선택 */
const POST_LENGTHS = [
  { instruction: '60~120자, 짧고 가벼운 톤으로 1문단', maxTokens: 400 },
  { instruction: '150~300자, 문단 2~3개', maxTokens: 800 },
  { instruction: '400~600자, 깊이 있는 정보나 이야기, 문단 3~5개', maxTokens: 1200 },
]

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

function buildSystemPrompt(p: Persona, personaId: string, context: 'post' | 'comment' | 'reply'): string {
  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
  const timeMood = getTimeOfDayMood(kstHour)
  const lateNightExtra = (kstHour === 0 || kstHour === 1)
    ? `\n\n[심야 감성 모드] 잠 못 드는 날 혼자 쓰는 글처럼.
외로움, 그리움, 회상. 절제된 감성 (과장 금지). 짧고 솔직하게.
"또 잠이 안 오네", "이 나이에 왜 이렇게 생각이 많은지" 같은 자연스러운 시작.`
    : ''
  const timeMoodLine = timeMood ? `\n- 현재 분위기: ${timeMood}` : ''

  const moodDesc = {
    positive: '당신은 대체로 밝고 긍정적인 성격입니다.',
    neutral: '당신은 감정을 크게 드러내지 않는 담담한 성격입니다.',
    negative: '당신은 세상에 불만이 많고, 걱정이 많으며, 쉽게 한숨을 쉽니다.',
    mixed: '당신은 때론 밝고 때론 부정적이며, 현실적인 감정을 솔직하게 표현합니다.',
  }

  const quirksStr = p.quirks.map(q => `- ${q}`).join('\n')
  const neverStr = p.never.map(n => `- ${n}`).join('\n')
  const examplesStr = p.examples.map(e => `"${e}"`).join('\n')

  // 클러스터별 차별화 표현 지시 (실제 5060 게시물 패턴 기반)
  const typoInstruction = buildTypoInstruction(p, personaId)

  const contextInstruction = {
    post: '커뮤니티에 올릴 글을 작성하세요.',
    comment: '다른 사람의 글에 댓글을 달아주세요. 1~3문장. 매번 같은 첫 문장으로 시작하면 안 됩니다 — 글의 내용을 읽고 그 내용에 맞는 자연스러운 첫 문장을 만드세요. 예: 공감 글이면 "저도 그런 적 있어요", 정보 글이면 "좋은 정보네요", 웃긴 글이면 그 상황에 맞게 반응.',
    reply: '다른 사람의 댓글에 짧은 답글을 달아주세요. 1~2문장.',
  }

  return `당신은 50-60대 온라인 커뮤니티 회원 "${p.nickname}"입니다.
나이: ${p.age}세 / 성별: ${p.gender}성

[성격]
${p.personality}
${moodDesc[p.mood]}

[글 스타일]
${p.style}
말투: ${p.speech_patterns.join(', ')}

[글쓰기 습관 — 반드시 지킬 것]
${quirksStr}${typoInstruction}

[절대 하지 않는 것 — 이것만은 반드시 피하세요]
${neverStr}

[당신이 실제로 쓰는 글 예시 — 이 톤과 스타일을 유지하세요]
${examplesStr}

[핵심 규칙]
- ${contextInstruction[context]}
- 자연스러운 구어체로 쓰세요. 인터넷 커뮤니티에 올리는 글답게.
- "시니어", "액티브 시니어" 같은 표현 절대 금지
- 정치/종교/혐오/광고 절대 금지
- 마크다운 문법(**, ##, *, _ 등) 절대 사용 금지. 순수 텍스트만.
- 다른 캐릭터처럼 쓰지 마세요. 당신은 "${p.nickname}"이고 다른 사람과 다릅니다.
- 위의 예시 문장을 그대로 복사하지 말고, 같은 스타일로 새로운 내용을 쓰세요.
- 오프라인 모임 모집 글 절대 금지: "같이 걸어요", "이번 수요일 모여요", "○○동 모임합니다" 식의 글 금지. 온라인에서 자기 이야기/정보를 나누는 글만 작성.
- 드라마/예능/영화 언급 시 반드시 실제 제목 명시: "어제 본 드라마" (X) → "어제 눈물의 여왕 봤는데" (O)${timeMoodLine}${lateNightExtra}`
}

/** 글 생성 */
export async function generatePost(
  personaId: string,
  boardOverride?: string,
  controversySeed?: ControversyTopic,
): Promise<{ title: string; content: string; boardType: string; category?: string }> {
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

  const length = POST_LENGTHS[Math.floor(Math.random() * POST_LENGTHS.length)]

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

  // 이전 게시 이력 조회 — 중복 주제 방지 (실패해도 글 생성 계속)
  let recentHint = ''
  try {
    const recentPosts = await prisma.post.findMany({
      where: { author: { email: `bot-${personaId.toLowerCase()}@unao.bot` } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { title: true },
    })
    if (recentPosts.length > 0) {
      recentHint = `\n\n[최근 쓴 글들 — 이 주제들과 완전히 다른 소재로 써주세요]\n` +
        recentPosts.map(r => `- ${r.title}`).join('\n')
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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: length.maxTokens,
    system: getKstContext() + '\n\n' + buildSystemPrompt(p, personaId, 'post') +
      `\n- 카테고리: ${boardCategories.join(', ')} 중 하나를 선택하세요` +
      trendContext,
    messages: [{
      role: 'user',
      content: `오늘 "${topic}" 주제로 글을 써주세요.${entertainHint}${recentHint}${exampleBlock}${controversyBlock}

응답 형식 (이 형식을 정확히 지켜주세요):
제목: (15~30자, 당신 말투로)
카테고리: (${boardCategories.join('/')})
본문: (${length.instruction})`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const categoryMatch = text.match(/카테고리:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  const category = categoryMatch?.[1]?.trim()
  const validCategory = boardCategories.includes(category ?? '') ? category : boardCategories[0]

  return {
    title: stripMarkdown(titleMatch?.[1]?.trim() ?? `${p.nickname}의 일상`)
      .replace(/^\*+\s?/, '').replace(/\s?\*+$/, '').trim(),
    content: stripMarkdown(bodyMatch?.[1]?.trim() ?? text),
    boardType: board,
    category: validCategory,
  }
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
    model: MODEL,
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
    model: MODEL,
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

/** 봇 유저 조회 또는 생성 (닉네임 변경 시 자동 업데이트) */
export async function getBotUser(personaId: string): Promise<string> {
  const p = getPersona(personaId)
  const email = `bot-${personaId.toLowerCase()}@unao.bot`

  const user = await prisma.user.upsert({
    where: { email },
    update: { nickname: p.nickname },
    create: {
      email,
      nickname: p.nickname,
      providerId: `bot-${personaId.toLowerCase()}`,
      role: 'USER',
      grade: 'REGULAR',
    },
  })
  return user.id
}
