import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'
import { getPersona, getAllPersonaIds, type Persona } from './persona-data.js'

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
    STORY: ['일상', '건강', '고민', '자녀', '기타'],
    HUMOR: ['유머', '힐링', '자랑', '추천', '기타'],
    JOB: ['전체'],
    WEEKLY: ['주간토론', '이번주화제', '자유수다', '기타'],
  }
  const boardCategories = categoryMap[board] ?? ['기타']

  const length = POST_LENGTHS[Math.floor(Math.random() * POST_LENGTHS.length)]

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: length.maxTokens,
    system: buildSystemPrompt(p, 'post') +
      `\n- 카테고리: ${boardCategories.join(', ')} 중 하나를 선택하세요`,
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
