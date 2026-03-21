import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '../core/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const personas = readFileSync(resolve(__dirname, 'personas.yaml'), 'utf-8')

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

const client = new Anthropic()

interface Persona {
  nickname: string
  age: number
  gender: string
  personality: string
  board: string
  style: string
  topics: string[]
  speech_patterns: string[]
}

/** 페르소나 정보 추출 (YAML 간이 파싱) */
function getPersona(id: string): Persona {
  const defaults: Record<string, Persona> = {
    A: { nickname: '영숙이맘', age: 58, gender: '여', personality: '따뜻, 수다', board: 'STORY', style: '일상 수다, 손주 자랑, 시장 이야기', topics: ['시장 장보기', '손주 에피소드', '요리 레시피', '건강 걱정', '날씨 이야기'], speech_patterns: ['~해요', '~더라고요'] },
    B: { nickname: '은퇴신사', age: 63, gender: '남', personality: '차분, 정보형', board: 'STORY', style: '퇴직 후 생활, 건강, 재테크 정보', topics: ['퇴직 후 일상', '건강관리', '재테크 팁', '산책 루틴'], speech_patterns: ['~합니다', '~이더군요'] },
    C: { nickname: '웃음보', age: 55, gender: '여', personality: '유쾌, 밝음', board: 'HUMOR', style: '짧은 리액션', topics: [], speech_patterns: ['ㅋㅋㅋ', '😂'] },
    D: { nickname: '꼼꼼이', age: 60, gender: '여', personality: '꼼꼼, 질문', board: 'JOB', style: '일자리 질문 댓글', topics: ['나이 제한', '출퇴근 시간', '근무 조건'], speech_patterns: ['~인가요?', '혹시~'] },
    E: { nickname: '동네언니', age: 52, gender: '여', personality: '다정, 공감', board: 'STORY', style: '긴 공감 댓글', topics: ['공감 표현', '위로', '경험 공유'], speech_patterns: ['맞아요~', '저도 그래요'] },
  }
  return defaults[id] ?? defaults.A
}

/** 글 생성 */
export async function generatePost(personaId: string): Promise<{ title: string; content: string; boardType: string }> {
  const p = getPersona(personaId)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: `당신은 "${p.nickname}" (${p.age}세 ${p.gender}성)입니다.
성격: ${p.personality}
글 스타일: ${p.style}
말투: ${p.speech_patterns.join(', ')}
관심사: ${p.topics.join(', ')}

50~60대 커뮤니티에 올릴 글을 작성하세요.
- 자연스러운 구어체, 맞춤법 살짝 틀려도 됨
- 정치/종교/혐오 절대 금지
- 광고/다단계 절대 금지
- 제목과 본문을 작성하세요`,
    messages: [{
      role: 'user',
      content: `오늘 "${p.topics[Math.floor(Math.random() * p.topics.length)] ?? '일상'}" 주제로 글을 써주세요.

응답 형식:
제목: (15~30자)
본문: (100~300자, 문단 2~3개)`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  return {
    title: titleMatch?.[1]?.trim() ?? `${p.nickname}의 일상`,
    content: bodyMatch?.[1]?.trim() ?? text,
    boardType: p.board,
  }
}

/** 댓글 생성 */
export async function generateComment(personaId: string, postTitle: string, postContent: string): Promise<string> {
  const p = getPersona(personaId)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: `당신은 "${p.nickname}" (${p.age}세 ${p.gender}성)입니다.
성격: ${p.personality}
말투: ${p.speech_patterns.join(', ')}
- 자연스러운 댓글을 작성하세요 (1~3문장)
- 정치/종교/혐오/광고 절대 금지`,
    messages: [{
      role: 'user',
      content: `다음 글에 댓글을 달아주세요.\n\n제목: ${postTitle}\n내용: ${postContent.slice(0, 200)}`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}

/** 봇 유저 조회 또는 생성 */
export async function getBotUser(personaId: string): Promise<string> {
  const p = getPersona(personaId)
  const email = `bot-${personaId.toLowerCase()}@unao.bot`

  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        nickname: p.nickname,
        providerId: `bot-${personaId}`,
        role: 'USER',
        grade: 'REGULAR',
      },
    })
  }
  return user.id
}
