import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { getPersona, getAllPersonaIds, type Persona } from './persona-data.js'

// ── 욕망 카테고리 → 적합 페르소나 매핑 ──
const DESIRE_PERSONA_MAP: Record<string, { personas: string[]; topicHint: string }> = {
  HEALTH:   { personas: ['H', 'P2', 'A'], topicHint: '건강 정보, 병원 경험, 증상 공감' },
  FAMILY:   { personas: ['A', 'L', 'E'], topicHint: '가족 이야기, 자녀 고민, 손주 자랑' },
  MONEY:    { personas: ['B', 'P4', 'N'], topicHint: '절약 팁, 재테크 경험, 연금 이야기' },
  RETIRE:   { personas: ['T', 'B', 'G'], topicHint: '은퇴 후 일상, 의미 찾기, 새 시작' },
  JOB:      { personas: ['P4', 'T', 'B'], topicHint: '일자리 경험, 자격증, 재취업 이야기' },
  RELATION: { personas: ['E', 'P5', 'C'], topicHint: '공감, 위로, 소통, 친구 이야기' },
  HOBBY:    { personas: ['G', 'M', 'F'], topicHint: '취미, 여행, 텃밭, 활동' },
  MEANING:  { personas: ['T', 'P', 'I'], topicHint: '삶의 의미, 감사, 보람, 철학' },
}

/** 오늘의 CafeTrend 조회 (speechTone 포함) */
async function getLatestTrend() {
  try {
    return await prisma.cafeTrend.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { dominantDesire: true, dominantEmotion: true, urgentTopics: true, cafeSummary: true },
    })
  } catch {
    return null
  }
}

/** 페르소나에게 주입할 오늘의 분위기 컨텍스트 */
function buildTrendContext(
  trend: Awaited<ReturnType<typeof getLatestTrend>>,
  personaId: string,
): string {
  if (!trend?.dominantDesire) return ''
  const desireInfo = DESIRE_PERSONA_MAP[trend.dominantDesire]
  const urgentTopics = Array.isArray(trend.urgentTopics)
    ? (trend.urgentTopics as Array<{ topic: string; psychInsight: string }>)
    : []
  const topUrgent = urgentTopics[0]
  const isRelevant = desireInfo?.personas.includes(personaId)
  const topicHint = isRelevant ? `\n- 오늘 어울리는 주제: ${desireInfo.topicHint}` : ''

  // speechTone 데이터 (trend-analyzer가 cafeSummary에 저장)
  const summary = trend.cafeSummary as Record<string, unknown> | null
  const keyPhrases = Array.isArray(summary?.topKeyPhrases)
    ? (summary.topKeyPhrases as string[]).slice(0, 5)
    : []
  const communityVocab = Array.isArray(summary?.topCommunityVocab)
    ? (summary.topCommunityVocab as string[]).slice(0, 5)
    : []
  const speechToneLine = (keyPhrases.length + communityVocab.length > 0)
    ? `\n- 오늘 커뮤니티 표현: ${keyPhrases.join(', ')}${communityVocab.length > 0 ? `\n- 자주 쓰는 어휘: ${communityVocab.join(', ')}` : ''}`
    : ''

  return `
[오늘의 커뮤니티 분위기 — 참고만, 직접 인용 절대 금지]
- 오늘 주된 관심: ${trend.dominantDesire} 관련 이야기
- 오늘의 감정 흐름: ${trend.dominantEmotion ?? '다양함'}${topUrgent ? `\n- 긴급 관심사: ${topUrgent.psychInsight}` : ''}${topicHint}${speechToneLine}

이 분위기를 당신의 개성으로 자연스럽게 녹여내세요.
위 내용을 그대로 쓰거나 직접 언급하지 마세요.`
}

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

const client = new Anthropic()

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

  const contextInstruction = {
    post: '커뮤니티에 올릴 글을 작성하세요.',
    comment: '다른 사람의 글에 댓글을 달아주세요. 1~3문장.',
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
${quirksStr}

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
- 위의 예시 문장을 그대로 복사하지 말고, 같은 스타일로 새로운 내용을 쓰세요.`
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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: length.maxTokens,
    system: buildSystemPrompt(p, 'post') +
      `\n- 카테고리: ${boardCategories.join(', ')} 중 하나를 선택하세요` +
      trendContext,
    messages: [{
      role: 'user',
      content: `오늘 "${topic}" 주제로 글을 써주세요.

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
    system: buildSystemPrompt(p, 'comment'),
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
