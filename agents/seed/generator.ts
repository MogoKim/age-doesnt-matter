import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { getPersona, getAllPersonaIds, type Persona } from './persona-data.js'
import type { ControversyTopic } from '../core/intelligence.js'
import { parseTopComments } from '../cafe/types.js'
import { hasYoungDemographicMarker } from '../community/content-transformer.js'

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
              topicHint: '은퇴 후 일상, 의미 찾기, 새 시작, 은퇴준비중' },
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


/** 페르소나의 주담당 욕망 카테고리 조회 */
function getPersonaDesire(personaId: string): string | null {
  for (const [desire, info] of Object.entries(DESIRE_PERSONA_MAP)) {
    if (info.personas.includes(personaId)) return desire
  }
  return null
}

// ── 갈등 DNA 변주 엔진 (v12) ──

type VariationType = 'ESCALATION' | 'EMOTIONAL_DEPTH' | 'REVERSAL'



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
const USER_POST_COMMENT_MODEL = 'claude-sonnet-4-6'

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
    return `댓글을 단다. 1~2문장. 글에서 구체적인 것 하나("설악산 다녀오셨군요" / "딸이 허전하시겠다") 집어서 반응. "맞아요 저도 그런 경험이 있어요" / "공감이 너무 돼요" / "위로가 됩니다" 패턴 절대 금지. 첫 단어로 "맞아요" 금지. 자기 경험 한 줄 붙여도 좋음. 마크다운 금지. 이모지(😊❤️ 등 특수문자 포함) 절대 금지.`
  }
  return `대댓글 1문장. 나는 이 글의 글쓴이가 아닌 다른 독자다. 글쓴이 입장에서 감사·응답하지 말 것. 상대 댓글 핵심 단어 하나 집기. "감사합니다" / "고마워요" / "감사해요" 절대 금지. 자연스러운 제3자 맞장구: "그쵸 ㅠ" / "맞아요ㅋ" / "저도 그런 경험". 마크다운 금지. 이모지(😊❤️ 등 특수문자 포함) 절대 금지.`
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
"시니어"/"액티브 시니어" 금지. 정치/종교/혐오/광고 금지. 이모지(😊❤️💛 등) 절대 금지 — 텍스트만. 드라마/예능 언급 시 실제 제목 명시. 예시 문장 그대로 복사 금지.${timeMoodLine}${lateNightExtra}`
}

/** 글 생성 — retired: seed bot post generation disabled */
export async function generatePost(
  _personaId: string,
  _boardOverride?: string,
  _controversySeed?: ControversyTopic,
): Promise<{ title: string; content: string; boardType: string; category?: string; variationType?: VariationType }> {
  throw new Error('generatePost is retired: seed bot post generation is disabled')
}

/** 킬러 포스트 생성 — retired: seed bot post generation disabled */
export async function generateKillerPost(
  _cafePost: {
    id: string
    title: string
    content: string
    desireCategory: string | null
  },
  _personaId: string,
): Promise<{ title: string; content: string; boardType: string; cafePostId: string } | null> {
  throw new Error('generateKillerPost is retired: seed bot post generation is disabled')
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
  priorComments?: string[],
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

  const SERIOUS_KEYWORDS = ['수술', '병원', '입원', '간병', '아프', '치료', '재활', '위독', '응급', '돌아가', '고통']
  const isSerious = SERIOUS_KEYWORDS.some(kw => `${postTitle} ${postContent}`.includes(kw))
  const seriousOverride = isSerious
    ? '\n\n[주의] 이 글은 아픔·돌봄 주제다. ㅋㅋ, ㅎㅎ, 웃음 표현 절대 금지. 짧고 조용하게 공감만.'
    : ''

  const priorCommentsHint = (priorComments && priorComments.length > 0)
    ? `\n\n[이 글에 이미 달린 댓글들 — 완전히 다른 표현·시각으로 달아주세요]\n` +
      priorComments.map(c => `- "${c.slice(0, 80)}"`).join('\n')
    : ''

  const response = await client.messages.create({
    model: getModelForPersona(personaId),
    max_tokens: 200,
    system: getKstContext() + '\n\n' + buildSystemPrompt(p, personaId, 'comment') + trendContext + seriousOverride,
    messages: [{
      role: 'user',
      content: `다음 글에 댓글을 달아주세요.\n\n제목: ${postTitle}\n내용: ${postContent.slice(0, 300)}${exampleBlock}${recentCommentHint}${priorCommentsHint}`,
    }],
  })

  const comment = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return stripMarkdown(comment)
}

function hasUserCommentQualityIssue(comment: string, priorComments: string[]): boolean {
  const text = comment.trim()
  if (text.length < 5) return true
  if (text.length > 260) return true

  const leakyPhrases = [
    'AI', '인공지능', '페르소나', '시스템 프롬프트', '지침상', '정책상',
    '댓글을 달기 어렵습니다', '제가 구성된',
  ]
  if (leakyPhrases.some(phrase => text.includes(phrase))) return true

  const genericOpenings = [
    '힘드시겠어요', '정말 힘드시겠어요', '저도 비슷한 경험', '저도 그런 경험',
    '저도 회사 다니면서 그런 상황', '팀 전체가 지치실 수밖에',
  ]
  if (genericOpenings.some(phrase => text.includes(phrase))) return true

  const awkwardPatterns = [
    '있는 것이 아니라 없는 것이 아니라',
    '아닌 것이 아니라 아닌 것이 아니라',
    '그런 것이 아니라 그런 것이 아니라',
  ]
  if (awkwardPatterns.some(phrase => text.includes(phrase))) return true
  if ((text.match(/것이 아니라/g) ?? []).length >= 2) return true

  return priorComments.some(prev => {
    const normalizedPrev = prev.replace(/\s+/g, '')
    const normalizedText = text.replace(/\s+/g, '')
    return normalizedPrev.length >= 12 && normalizedText.includes(normalizedPrev.slice(0, 24))
  })
}

/** 실제 회원 글 전용 댓글 생성 — Sonnet 고정, 본문 요약형 봇 댓글 방지 */
export async function generateUserPostComment(
  personaId: string,
  postTitle: string,
  postContent: string,
  priorComments: string[] = [],
): Promise<string> {
  const p = getPersona(personaId)
  const trend = await getLatestTrend()
  const trendContext = buildTrendContext(trend, personaId, p)

  const recentComments = await prisma.comment.findMany({
    where: {
      author: { email: `bot-${personaId.toLowerCase()}@unao.bot` },
      parentId: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { content: true },
  }).catch(() => [])

  const priorCommentsHint = priorComments.length > 0
    ? `\n\n[이미 달린 댓글 — 아래와 다른 각도·표현·감정으로 써라 (같은 뜻이라도 비슷한 표현 금지)]\n${priorComments.map(c => `- ${c.slice(0, 120)}`).join('\n')}`
    : '\n\n[이미 이 글에 달린 댓글]\n아직 없음'

  const recentCommentHint = recentComments.length > 0
    ? `\n\n[이 봇이 최근 단 댓글 — 같은 첫 문장과 구조 금지]\n${recentComments.map(c => `- ${c.content.slice(0, 90)}`).join('\n')}`
    : ''

  const forbiddenAnchors = extractForbiddenAnchors(priorComments)
  const forbiddenSection = forbiddenAnchors.length > 0
    ? `\n\n[금지 표현 — 앞 댓글에서 이미 사용됨. 절대 쓰지 마라]\n${forbiddenAnchors.join(' / ')}`
    : ''

  const system = `${getKstContext()}

당신은 우나어 회원이 쓴 글을 방금 읽은 50대 60대 한국인 회원입니다.
이 댓글은 실제 글쓴이가 보게 됩니다. 댓글 수를 채우는 것이 아니라, 글쓴이가 "사람이 읽고 반응해줬다"고 느끼게 하는 것이 목적입니다.

[가장 중요한 원칙]
- 글쓴이 문장을 다시 설명하지 마세요.
- 본문에 나온 사실을 요약하지 마세요.
- "힘드시겠어요", "저도 비슷한 경험이 있어요" 같은 템플릿으로 시작하지 마세요.
- 페르소나의 취미·가족 설정을 억지로 끼워 넣지 마세요.
- 댓글 역할표처럼 공감/질문/조언/경험을 기계적으로 나누지 마세요.
- 이미 달린 댓글과 같은 결론, 같은 단어, 같은 문장 구조를 피하세요.
- 글쓴이가 미처 정리하지 못한 감정, 쟁점, 다음 행동 중 그 순간 가장 자연스러운 하나만 짚으세요.
- 댓글은 1~3문장. 짧아도 됩니다. 번호, 따옴표, 설명 없이 댓글 본문만 쓰세요.

[페르소나 참고]
닉네임: ${p.nickname}
나이: ${p.age}세
성향: ${p.personality}
말투: ${p.speech_patterns.join(' / ')}

페르소나는 말투 참고용입니다. 글 주제와 맞지 않는 설정은 사용하지 마세요.
${trendContext}`

  const userContent = `회원 글에 자연스러운 댓글 하나만 달아주세요.

제목: ${postTitle}
본문:
${postContent.replace(/<[^>]+>/g, '').slice(0, 900)}
${priorCommentsHint}
${recentCommentHint}${forbiddenSection}`

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: USER_POST_COMMENT_MODEL,
      max_tokens: 180,
      system,
      messages: [{ role: 'user', content: userContent }],
    })

    const comment = response.content[0].type === 'text' ? stripMarkdown(response.content[0].text.trim()) : ''
    if (!hasUserCommentQualityIssue(comment, priorComments)) return comment
  }

  return ''
}

/** 시트 화제성 파동 댓글 생성 — Sonnet 모델, 본문 맥락 반영, 키워드 검증 포함 */
function extractForbiddenAnchors(priorCommentTexts: string[], rawContent?: string): string[] {
  const cleanedRaw = rawContent
    ? rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    : ''
  const sources = cleanedRaw ? [...priorCommentTexts, cleanedRaw] : priorCommentTexts
  if (sources.length === 0) return []

  // "저렇게"는 실제 anchor 반복 사례로 확인되어 의도적으로 제외
  const STOP = new Set([
    '마세요','있어요','그래서','했는데','저도','진짜','그냥','이제','그때',
    '너무','정말','많이','그래도','하지만','근데','이거','저거','여기',
    '좀더','아직','또한','이렇게','그렇게','같아요','같은데',
    '요즘','나도','우리','정도','느낌','생각','그분','항상','가끔','하네요',
  ])

  const text = sources.join(' ')

  // 단어 anchor (최대 4개)
  const wordTokens = text.match(/[가-힣]{2,6}/g) ?? []
  const wordFreq = new Map<string, number>()
  for (const t of wordTokens) {
    if (!STOP.has(t)) wordFreq.set(t, (wordFreq.get(t) ?? 0) + 1)
  }
  const wordAnchors = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k)

  // 구문 anchor: 2~3어절 슬라이딩 윈도우, 한글 3자 이상 어절 포함 구문만 (최대 2개)
  const phraseAnchors: string[] = []
  for (const source of sources) {
    const words = source.split(/\s+/).filter(w => /[가-힣]/.test(w))
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(' ')
        const hasContent = words.slice(i, i + n).some(w => w.length >= 3 && !STOP.has(w))
        if (hasContent && !phraseAnchors.includes(phrase) && phraseAnchors.length < 2) {
          phraseAnchors.push(phrase)
        }
      }
    }
  }

  return [...wordAnchors, ...phraseAnchors].slice(0, 6)
}

// ── v1.5 source-only fact 차단 (제한된 카테고리만) ──────────────────────────────
// 정책: 댓글에 쓸 수 있는 구체 사실은 제목+본문에 실제 등장한 것만 허용.
// sourceComments(원본 사이트 댓글)에만 있고 본문에 없는 구체 사실은 차단.
// 차단 카테고리: 숫자·금액·단위 / 학년 / 가족관계 / 브랜드(영문) / 접미 고유명사.
// (본문에 없는 2글자+ 명사 전부 차단은 과차단 위험 → 하지 않음. 작품명 등 일반 한글 고유명사는 통과)

// 가족관계어 — 모두 "선행어(우리/저희/제/내/울)가 있으면 봇 자기경험 → 허용",
// 선행어 없이 등장하면(=글쓴이/원본 인물 지칭) 본문에 없을 때 차단.
// 1글자 가족어('형','딸')는 "형편/딸기" 등 오탐 위험이 커서 제외.
const FAMILY_TERMS = [
  '동생', '둘째', '첫째', '막내', '셋째', '넷째', '남편', '아내', '와이프',
  '시어머니', '시아버지', '시누이', '장모', '장인', '며느리', '사위',
  '조카', '손주', '손녀', '손자', '외삼촌', '아들', '누나', '오빠', '언니',
  '이모', '고모', '삼촌',
] as const
const EDU_TERMS = [
  '유학', '학비', '수능', '재수', '삼수', '등록금', '과외', '대학원', '편입', '자퇴',
] as const
// 숫자+단위 (금액·체중·기간·나이 등)
const NUM_UNIT_RE = /\d+\s*(?:억|천만|만\s*원|만원|원|키로|킬로|kg|㎏|개월|주\s*차|일\s*차|단계|살|세|명|평|년\s*차|회차)/g
// 학년 (고1~고3, 중1~중3, 초1~초6)
const AGE_GRADE_RE = /(?:고|중|초)\s*[1-6]/g
// 접미 고유명사 (앞에 1~5글자 붙은 합성: 펫카페·반올림라이프 등). '카페'/'라이프' 단독은 매치 안 됨
const SUFFIX_PROPER_RE = /[가-힣]{1,5}(?:라이프|카페|블로그|채널|클럽|아카데미|스튜디오)/g
// 영문 브랜드/고유 (2글자+). 일반 약어는 화이트리스트로 제외
const ENG_RE = /[A-Za-z]{2,}/g
const ENG_WHITELIST = new Set(['ai', 'tv', 'pc', 'ott', 'sns', 'kg', 'cm', 'km', 'ml', 'app'])

/** 댓글에서 "본문(allowedNorm)에 없는 구체 사실"을 추출. 비어있으면 위반 없음. */
export function detectSourceOnlyFacts(comment: string, allowedNorm: string): string[] {
  const viol: string[] = []
  const push = (raw: string) => {
    const n = raw.replace(/\s+/g, '').toLowerCase()
    if (n && !allowedNorm.includes(n)) viol.push(raw.trim())
  }
  for (const m of comment.matchAll(NUM_UNIT_RE)) push(m[0])
  for (const m of comment.matchAll(AGE_GRADE_RE)) push(m[0])
  for (const m of comment.matchAll(SUFFIX_PROPER_RE)) push(m[0])
  for (const m of comment.matchAll(ENG_RE)) {
    if (!ENG_WHITELIST.has(m[0].toLowerCase())) push(m[0])
  }
  for (const t of EDU_TERMS) if (comment.includes(t)) push(t)
  // 가족관계어: 선행어(우리/저희/제/내/울)가 있으면 봇 자기경험 → 허용, 없으면 차단
  for (const t of FAMILY_TERMS) {
    let i = comment.indexOf(t)
    while (i !== -1) {
      const before = comment.slice(Math.max(0, i - 3), i)
      if (!/우리|저희|제|내|울/.test(before)) { push(t); break }
      i = comment.indexOf(t, i + 1)
    }
  }
  return [...new Set(viol)]
}

// ── v1.6 image-like source anchor 차단 ───────────────────────────────────────
// 이미지/초단문 글은 사용자가 볼 수 있는 본문 정보가 부족하므로, 원본 사이트 댓글의
// 인물명·인용구·평가어를 "사실"처럼 가져오면 어색해진다. 이 guard는 image-like 글에만 적용한다.
const SOURCE_ANCHOR_STOP = new Set([
  '진짜', '정말', '너무', '그냥', '완전', '대박', '댓글', '사람', '게시물',
  '보니까', '보면서', '이거', '저거', '그거', '같아요', '같네요', '하네요',
  '했네요', '봤어요', '아니', '근데', '그런데', '그래도', '이렇게', '저렇게',
  '처음', '두번째', '첫번째', '우리', '저희', '나도', '저도',
])

const SOURCE_ANCHOR_ALIASES = [
  { source: '유튭', output: '유튜브' },
  { source: '유투브', output: '유튜브' },
] as const

function normalizeAnchorText(value: string): string {
  return value.replace(/[^가-힣a-zA-Z0-9]+/g, '').toLowerCase()
}

function stripKoreanTail(value: string): string {
  return value
    .replace(/(?:에게|한테|으로|부터|까지|처럼|에서|이랑|와|과|은|는|이|가|을|를|에|도|만|로|야)$/u, '')
    .replace(/(?:구나|네요|어요|아요|더라|더라고요|잖아요|같네요|같아요)$/u, '')
}

function addSourceAnchorCandidate(candidates: Set<string>, raw: string): void {
  const normalized = normalizeAnchorText(raw)
  if (!normalized) return

  const hangulLength = (normalized.match(/[가-힣]/g) ?? []).length
  const base = stripKoreanTail(normalized)
  const baseHangulLength = (base.match(/[가-힣]/g) ?? []).length
  const withoutEnglishSuffix = normalized.replace(/[a-z0-9]+$/i, '')
  const baseWithoutEnglishSuffix = base.replace(/[a-z0-9]+$/i, '')

  for (const candidate of [normalized, base, withoutEnglishSuffix, baseWithoutEnglishSuffix]) {
    const hLen = (candidate.match(/[가-힣]/g) ?? []).length
    if (candidate.length >= 3 && hLen >= 3 && !SOURCE_ANCHOR_STOP.has(candidate)) {
      candidates.add(candidate)
    }
  }

  if (hangulLength >= 3 && baseHangulLength >= 3 && !SOURCE_ANCHOR_STOP.has(base)) {
    candidates.add(base)
  }
}

function extractSourceAnchorCandidates(sourceComments: string[]): Set<string> {
  const candidates = new Set<string>()

  for (const source of sourceComments) {
    const rawTokens = source.match(/[가-힣a-zA-Z0-9]{2,20}/g) ?? []
    const words = rawTokens
      .map(t => stripKoreanTail(normalizeAnchorText(t)))
      .filter(t => t.length >= 2 && !SOURCE_ANCHOR_STOP.has(t))

    for (const token of rawTokens) addSourceAnchorCandidate(candidates, token)

    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const phraseWords = words.slice(i, i + n)
        const phrase = phraseWords.join('')
        const hasContentWord = phraseWords.some(w => (w.match(/[가-힣]/g) ?? []).length >= 3)
        if (hasContentWord && phrase.length >= 4 && !SOURCE_ANCHOR_STOP.has(phrase)) {
          candidates.add(phrase)
        }
      }
    }
  }

  return candidates
}

export function detectSourceOnlyAnchors(
  comment: string,
  sourceComments: string[],
  allowedNorm: string,
): string[] {
  if (sourceComments.length === 0) return []

  const commentNorm = normalizeAnchorText(comment)
  const allowed = normalizeAnchorText(allowedNorm)
  const sourceNorm = normalizeAnchorText(sourceComments.join(' '))
  const violations: string[] = []

  for (const candidate of extractSourceAnchorCandidates(sourceComments)) {
    if (!allowed.includes(candidate) && commentNorm.includes(candidate)) {
      violations.push(candidate)
    }
  }

  for (const alias of SOURCE_ANCHOR_ALIASES) {
    if (
      sourceNorm.includes(alias.source) &&
      commentNorm.includes(alias.output) &&
      !allowed.includes(alias.output)
    ) {
      violations.push(alias.output)
    }
  }

  return [...new Set(violations)].slice(0, 8)
}

const ANCHOR_STOP = new Set([
  '그래서', '하지만', '그런데', '그리고', '그러니까', '그러면', '이렇게', '그렇게',
  '저렇게', '어떻게', '왜냐면', '정말로', '진짜로', '너무나', '조금씩', '우리가',
  '저희가', '그러게', '그러다', '그치만', '아무튼', '어쨌든',
])

/** 본문+제목에서 anchor 후보(3~6자 한글 명사) 추출 */
export function extractBodyAnchors(title: string, rawText: string): string[] {
  const text = (title + ' ' + rawText.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
  const tokens = text.match(/[가-힣]{3,6}/g) ?? []
  return [...new Set(tokens)].filter(t => !ANCHOR_STOP.has(t))
}

/** 같은 글 내 같은 anchor 2회까지 허용, 3회째(prior 2회 이상 + 현재 포함) reject → 위반 anchor 반환 */
export function violatesAnchorCap(comment: string, anchors: string[], priorTexts: string[]): string | null {
  for (const a of anchors) {
    if (!comment.includes(a)) continue
    const priorCount = priorTexts.filter(t => t.includes(a)).length
    if (priorCount >= 2) return a
  }
  return null
}

const LEAK_PHRASES = [
  '제가 구성된', '구성된 인물', '설정되어 있고', '참여하지 않기로',
  '댓글을 달기 어렵습니다', '제 캐릭터', '페르소나', '시스템 프롬프트',
  'AI 모델', '정책상', '지침상',
  // 메타 누설 — 본문 truncation/미열람을 댓글에 노출 (예: "본문이 잘려서 끝까지 못 봤지만")
  '본문이 잘려', '끝까지 못 봤', '본문을 못 봤', '내용을 못 봤',
  '내용이 잘려', '글이 잘려', '사진을 볼 수 없', '이미지라 내용', '본문 내용 올려',
  // P1(2026-06-16): 이미지/사진을 못 본다는 실토 변형 — 본문이 길어 가드 미적용이던 케이스
  '사진을 못 봐', '사진을 못봐', '사진 못 봐', '사진을 못 봤', '사진을 못봤',
  '사진이 안 보', '사진이 안보', '이미지가 안 보', '이미지가 안보',
  '이미지를 못 봐', '이미지를 못봐', '이미지를 볼 수 없', '못 봐서 정확', '못봐서 정확',
  '안 보여서 정확', '안보여서 정확', '못 봐서 모르', '못봐서 모르',
]

function isLeakySheetComment(text: string): boolean {
  return LEAK_PHRASES.some(phrase => text.includes(phrase))
}

export async function generateSheetViralComment(
  personaId: string,
  postTitle: string,
  rawContent: string,
  waveType: 'empathy' | 'critical' | 'reversal',
  keyTerms: string[],
  sourceComments: string[] = [],
  options?: { sourceCommentIndex?: number; priorCommentTexts?: string[] },
): Promise<string> {
  // P2(2026-06-16): 본인 임신/출산/육아 단계 글(20-30대)엔 50-60 봇 댓글 부적합 — 댓글 생성 skip.
  //   스크래퍼가 발행을 막지만, 이미 발행된 글/우회 경로 보호용 백스톱.
  if (hasYoungDemographicMarker(`${postTitle} ${rawContent}`)) {
    console.log('  [SheetViral] 젊은층 데모그래픽 글 — 댓글 skip')
    return ''
  }
  // ── 이미지 전용 글 감지: 텍스트 50자 미만 ──
  const cleanText = rawContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const isImagePost = cleanText.length < 50
  if (isImagePost) {
    rawContent = ''
    if (sourceComments.length === 0) {
      console.log(`  [SheetViral] 이미지 전용 글 + 원본댓글 없음 — skip`)
      return ''
    }
    console.log(`  [SheetViral] 이미지 전용 글 — 원본 댓글 ${sourceComments.length}개 각색 모드`)
  }
  // ─────────────────────────────────────────────────────────────────────────────
  const p = getPersona(personaId)

  // ── 댓글마다 길이·이모티콘 랜덤 스타일 (집합적 획일성 = AI 티 완화) ──
  // 짧은 반응이 전혀 없고(0%) 전부 100% 이모티콘이라 AI 티가 났음 → 호출마다 랜덤 강제
  const styleRoll = Math.random()
  const lengthMode: 'short' | 'medium' | 'long' = isImagePost
    ? (styleRoll < 0.6 ? 'short' : 'medium')                          // 이미지글: 길게 금지
    : (styleRoll < 0.35 ? 'short' : styleRoll < 0.80 ? 'medium' : 'long') // short35/med45/long20
  const useEmoji = Math.random() < 0.55                                // 약 55%만 이모티콘
  const LENGTH_RULE = {
    short: '이번 댓글은 "아주 짧게" — 5~25자, 한 줄 가벼운 반응만. 본문 요약·설명 금지, 딱 한 가지에만 툭 반응. (예: "맞아요 ㅋㅋ", "헐 대박", "와 공감돼요", "어머 부럽다", "이건 좀 그렇네요"). 짧으면 막연한 반응도 괜찮습니다.',
    medium: '이번 댓글은 "보통" — 1~2문장. 본문 한 부분에만 반응하고 길게 늘어놓지 마세요.',
    long: '이번 댓글은 "조금 길게" — 2~3문장. 본문 상황에 공감하며 본인 생각/경험을 곁들여도 됩니다.',
  }[lengthMode]
  const EMOJI_RULE = useEmoji
    ? '- ㅎ/ㅋ/ㅠ 이모티콘을 1개 정도만 자연스럽게 (남발 금지)'
    : '- 이번 댓글에는 이모티콘(ㅎ/ㅋ/ㅠ)을 쓰지 마세요.'

  const WAVE_PROMPTS = {
    empathy: '글에서 공감되는 한 부분에 반응하세요. 필요하면 본인 경험을 곁들여도 되지만 매번 넣을 필요는 없습니다.',
    critical: '한 가지만 살짝 다른 시각으로 봐주세요. 단정적이지 않고 조심스럽게. 정해진 문구로 시작하지 말고 매번 다르게.',
    reversal: '읽고 묵직하게 느낀 점이나 비슷한 경험을 남기세요. 결론짓지 말고 여운만. 정해진 문구 없이 자연스럽게.',
  }

  const systemPrompt = `당신은 이 글을 읽은 50~60대 한국 여성입니다.
실제 카페 댓글처럼, 매번 길이와 말투가 다릅니다. 어떤 댓글은 한 줄로 툭, 어떤 댓글은 조금 길게.

[이번 댓글 길이]
${LENGTH_RULE}

[말투]
- 댓글 첫마디를 매번 다르게 시작하세요. 늘 같은 감탄사(어머/아이고/맞아맞아/근데 솔직히)로 시작하지 마세요.
- 완벽한 문장 구조 피하기 (실제 댓글은 비문·생략이 많음).
${EMOJI_RULE}

[내용]
- 긴 댓글이면 본문의 구체적 상황(인물·사건)에 반응하세요. 짧은 댓글이면 한 가지에만 가볍게 반응해도 됩니다.
- 긴 댓글에서 막연한 공감만 늘어놓는 건 금지(짧은 댓글의 가벼운 반응은 OK).

[페르소나] ${p.nickname} (${p.age}세, ${p.personality.slice(0, 80)})

[사실 사용 규칙 — 매우 중요]
- 댓글에 쓸 수 있는 구체 사실(숫자·금액·나이·학년·가족관계·브랜드·고유명사·지명)은 위 제목과 본문에 실제로 등장한 것만 허용합니다.
- 참고 반응(아래)에만 있고 본문에 없는 구체 사실은 절대 인용하지 마세요. 참고 반응은 감정 톤·반응 방향만 참고합니다.
- 본인 경험은 "우리 딸도~"처럼 일반적으로만 언급하고, 구체 수치(○○킬로, ○억, 고3 등)는 붙이지 마세요.
- 본문에 없는 사물·기구·행동(예: 덤벨/특정 운동기구/특정 음식)을 지어내 언급하지 마세요. 확실치 않으면 막연한 한 줄 반응으로 끝내세요.

[글 성격 — 중요]
- 이 글은 질문이거나 궁금증을 묻는 글일 수 있습니다. 그럴 땐 "후기 잘 봤다 / 경험담 감사" 같이 후기·경험담으로 단정하지 마세요. 질문이면 궁금증에 공감하거나 가볍게 의견만 남기세요.

[댓글 방향]
${WAVE_PROMPTS[waveType]}`

  // P1-B+C-2: forbidden anchor — priorCommentTexts + rawContent 본문 초반부 (3차 수정: 본문 anchor 사전 차단)
  const forbiddenAnchors = extractForbiddenAnchors(options?.priorCommentTexts ?? [], rawContent)

  let commentContext = ''
  if (sourceComments.length > 0) {
    const idx = options?.sourceCommentIndex
    const focusIdx = (idx !== undefined && sourceComments.length > 1)
      ? idx % sourceComments.length
      : 0
    const focus = sourceComments[focusIdx]!

    if (isImagePost) {
      // 이미지 글: 맥락 설명에 이미지/본문 단어 없음, 메타 발화 금지어 섹션 추가
      commentContext = `\n\n제목과 전체 분위기에만 짧게 반응하세요. 아래 반응은 감정 톤 참고용입니다.\n아래 반응의 구체 표현·인물명·인용구·평가어·숫자·브랜드는 그대로 쓰지 마세요.\n확신할 수 없으면 짧게 반응하세요.\n\n[글 분위기·감정 톤 참고용 (구체 표현 인용 금지)]\n${focus}`
      commentContext += `\n\n[절대 쓰지 말아야 할 표현]\n이미지라 내용을 못 봤지만 / 본문을 못 봤지만 / 사진을 볼 수 없어서 / 내용 올려주세요 / 이미지 게시글 / 내용을 못 봤다 / 본문 내용 올려주실 수 있나요`
    } else if (idx !== undefined && sourceComments.length > 1) {
      // 일반 글, sourceCommentIndex 지정: focus 1개만 (rest 완전 제거)
      commentContext = `\n\n[글 분위기·감정 톤 참고용 (아래의 숫자·고유명사 등 구체 사실은 인용 금지, 톤만 참고)]\n${focus}`
    } else {
      // sourceComments 1개 또는 index 미지정
      commentContext = `\n\n[글 분위기·감정 톤 참고용 (아래의 숫자·고유명사 등 구체 사실은 인용 금지, 톤만 참고)]\n${focus}`
    }

    if (forbiddenAnchors.length > 0) {
      commentContext += `\n\n[금지 표현 — 앞 댓글에서 이미 사용됨. 절대 쓰지 마라]\n${forbiddenAnchors.join(' / ')}`
    }
  }
  // P1-C: 이미 달린 댓글 (강화된 지시 — 같은 뜻이라도 비슷한 표현 금지)
  if (options?.priorCommentTexts && options.priorCommentTexts.length > 0) {
    commentContext += `\n\n[이미 달린 댓글들 — 아래와 다른 각도·표현·감정으로 써라 (같은 뜻이라도 비슷한 표현 금지)]\n${options.priorCommentTexts.join('\n')}`
  }

  // P1(2026-06-16): 본문이 길어도 이미지를 포함/언급하는 글이면 메타발화 금지.
  //   기존 금지블록은 isImagePost(본문<50자)에만 있어, 사진을 가리키는 긴 글에서 봇이 "사진을 못 봐서"라고 실토했음.
  const refersToImage = /<img/i.test(rawContent) || /사진|이미지|짤|캡처|움짤/.test(postTitle + ' ' + cleanText)
  if (!isImagePost && refersToImage) {
    commentContext += `\n\n[절대 쓰지 말아야 할 표현]\n사진을 못 봐서 / 사진을 못봐서 / 이미지가 안 보여서 / 사진을 볼 수 없어서 / 사진·이미지를 못 봤다 / 내용을 못 봤다 / 사진 올려주세요\n→ 사진이 안 보여도 그런 말을 절대 하지 말고, 제목과 본문 텍스트에 드러난 상황에만 반응하세요.`
  }

  // v1.5: 출력 검증용 — 허용 텍스트(제목+본문)와 본문 anchor
  const allowedNorm = (postTitle + ' ' + cleanText).replace(/\s+/g, '').toLowerCase()
  const bodyAnchors = extractBodyAnchors(postTitle, cleanText)
  const priorTexts = options?.priorCommentTexts ?? []

  const maxAttempts = 3
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

    if (isLeakySheetComment(cleaned)) {
      console.warn(`  [SheetViral] leaky output 감지 — skip (attempt ${attempt + 1})`)
      continue
    }

    // v1.5-A: source-only fact 차단 — 본문에 없는 구체 사실(숫자·금액·학년·가족관계·브랜드·고유명사) 인용 시 재생성
    const sof = detectSourceOnlyFacts(cleaned, allowedNorm)
    if (sof.length > 0) {
      console.warn(`  [SheetViral] source-only fact 감지 [${sof.join(', ')}] — skip (attempt ${attempt + 1})`)
      continue
    }

    // v1.7: source-only anchor 차단 — 원본댓글에만 있고 제목/본문엔 없는 표현(예: 크루아상) 인용 방지.
    //        이미지 글뿐 아니라 sourceComments 있는 모든 글에 적용 (일반 글 source comment 누수 차단).
    if (sourceComments.length > 0) {
      const sourceOnlyAnchors = detectSourceOnlyAnchors(cleaned, sourceComments, allowedNorm)
      if (sourceOnlyAnchors.length > 0) {
        console.warn(`  [SheetViral] source-only anchor 감지 [${sourceOnlyAnchors.join(', ')}] — skip (attempt ${attempt + 1})`)
        continue
      }
    }

    // v1.5-B: 본문 anchor 반복 cap — 같은 글 내 같은 anchor 3회째 차단
    const anchorHit = violatesAnchorCap(cleaned, bodyAnchors, priorTexts)
    if (anchorHit) {
      console.warn(`  [SheetViral] anchor 반복 cap "${anchorHit}" 3회째 — skip (attempt ${attempt + 1})`)
      continue
    }

    // 키워드 검증: 핵심 단어 1개 이상 포함 여부 (짧음 모드는 면제 — 한 줄 반응이 버려지지 않게)
    const hasKeyTerm = lengthMode === 'short' || keyTerms.length === 0 || keyTerms.some(term => cleaned.includes(term))
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
