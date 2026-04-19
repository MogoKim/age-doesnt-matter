import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { getPersona, getAllPersonaIds, type Persona } from './persona-data.js'

// ── 욕망 카테고리 → 적합 페르소나 매핑 (실제 39+EN 페르소나 기반) ──
export const DESIRE_PERSONA_MAP: Record<string, { personas: string[]; topicHint: string }> = {
  HEALTH:   { personas: ['H', 'A', 'AC'],   topicHint: '건강 정보, 병원 경험, 증상 공감, 약 부작용, 건강검진 결과' },
  FAMILY:   { personas: ['E', 'BC', 'BD'],  topicHint: '자녀 이야기(취업·직장·결혼), 고부갈등(시어머니 입장), 사위/며느리 이야기, 남편 불만·하소연, 노부부 갈등, 손주 자랑. 손주가 등장하면 반드시 유치원생/초등 저학년 수준으로만.' },
  MONEY:    { personas: ['B', 'N', 'AZ'],   topicHint: '절약 팁, 재테크 경험, 연금 이야기, 물가 한탄, ETF·부동산 현실 공유' },
  RETIRE:   { personas: ['T', 'G', 'BA'],   topicHint: '은퇴 후 일상, 의미 찾기, 새 시작, 무료함, 취미 찾기, 은퇴 준비 현실' },
  JOB:      { personas: ['T', 'B', 'AZ'],   topicHint: '일자리 경험, 자격증, 재취업 이야기, 나이 차별' },
  RELATION: { personas: ['C', 'V', 'AD'],   topicHint: '공감, 위로, 소통, 친구 이야기, 섭섭함, 오해, 화해' },
  HOBBY:    { personas: ['M', 'F', 'AB'],   topicHint: '취미, 여행 후기(구체적 장소명 포함), 텃밭, 등산 코스명' },
  MEANING:  { personas: ['I', 'P', 'AE'],   topicHint: '삶의 의미, 감사, 보람, 철학, 나이 들어 깨달은 것' },
  HUMOR:    { personas: ['AF', 'AY', 'U'],  topicHint: '웃긴 일상, 황당 에피소드, 공감 유머, 아재개그, "나만 이래?" 공감글' },
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

/** 페르소나의 주담당 욕망 카테고리 조회 */
function getPersonaDesire(personaId: string): string | null {
  for (const [desire, info] of Object.entries(DESIRE_PERSONA_MAP)) {
    if (info.personas.includes(personaId)) return desire
  }
  return null
}

/** 페르소나에게 주입할 오늘의 분위기 컨텍스트 */
function buildTrendContext(
  trend: Awaited<ReturnType<typeof getLatestTrend>>,
  personaId: string,
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

  // hotTopics top-5 주제명
  const hotTopics = Array.isArray(trend.hotTopics)
    ? (trend.hotTopics as Array<{ topic: string; count?: number }>)
        .slice(0, 5)
        .map(t => t.topic)
        .filter(Boolean)
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

  const hotTopicLine = hotTopics.length > 0
    ? `\n- 오늘 커뮤니티 핫 주제: ${hotTopics.join(', ')}`
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
[오늘의 커뮤니티 분위기 — 참고만, 직접 인용 절대 금지]
- 오늘 주된 관심: ${trend.dominantDesire} 관련 이야기${myTopicLine}${hotTopicLine}${emotionLine}${vocabLine}${desirePctLine}

이 분위기를 당신의 개성으로 자연스럽게 녹여내세요.
위 내용을 그대로 쓰거나 직접 언급하지 마세요.`
}

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

const client = new Anthropic()

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
function buildSystemPrompt(p: Persona, context: 'post' | 'comment' | 'reply'): string {
  const moodDesc = {
    positive: '당신은 대체로 밝고 긍정적인 성격입니다.',
    neutral: '당신은 감정을 크게 드러내지 않는 담담한 성격입니다.',
    negative: '당신은 세상에 불만이 많고, 걱정이 많으며, 쉽게 한숨을 쉽니다.',
    mixed: '당신은 때론 밝고 때론 부정적이며, 현실적인 감정을 솔직하게 표현합니다.',
  }

  const quirksStr = p.quirks.map(q => `- ${q}`).join('\n')
  const neverStr = p.never.map(n => `- ${n}`).join('\n')
  const examplesStr = p.examples.map(e => `"${e}"`).join('\n')

  // 맞춤법 quirk가 있는 페르소나에게만 오타 실제 예시를 주입
  const typoInstruction = p.quirks.some(q => q.includes('맞춤법')) ? `

[오타 실제 예시 — 글 3개 중 1개에는 아래 중 하나 자연스럽게 포함]
- "됩니다" → "됩다" 또는 "됩니다" (그대로)
- "하세요" → "하세여"
- "~어요" → "~에요" 혼용
- 문장 끝 마침표 생략 (구어체)
억지 오타는 금물. 어색하면 생략해도 됩니다.` : ''

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
- 드라마/예능/영화 언급 시 반드시 실제 제목 명시: "어제 본 드라마" (X) → "어제 눈물의 여왕 봤는데" (O)`
}

/** 글 생성 */
export async function generatePost(
  personaId: string,
  boardOverride?: string,
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
  const trendContext = buildTrendContext(trend, personaId)

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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: length.maxTokens,
    system: getKstContext() + '\n\n' + buildSystemPrompt(p, 'post') +
      `\n- 카테고리: ${boardCategories.join(', ')} 중 하나를 선택하세요` +
      trendContext,
    messages: [{
      role: 'user',
      content: `오늘 "${topic}" 주제로 글을 써주세요.${entertainHint}${recentHint}

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
    title: stripMarkdown(titleMatch?.[1]?.trim() ?? `${p.nickname}의 일상`),
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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: getKstContext() + '\n\n' + buildSystemPrompt(p, 'comment'),
    messages: [{
      role: 'user',
      content: `다음 글에 댓글을 달아주세요.\n\n제목: ${postTitle}\n내용: ${postContent.slice(0, 300)}`,
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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    system: buildSystemPrompt(p, 'reply'),
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
