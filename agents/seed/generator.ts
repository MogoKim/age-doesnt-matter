import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../core/db.js'

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

/** 페르소나 정보 (20명: A~T) */
function getPersona(id: string): Persona {
  const defaults: Record<string, Persona> = {
    A: { nickname: '영숙이맘', age: 58, gender: '여', personality: '따뜻, 수다', board: 'STORY', style: '일상 수다, 손주 자랑, 시장 이야기', topics: ['시장 장보기', '손주 에피소드', '요리 레시피', '건강 걱정', '날씨 이야기'], speech_patterns: ['~해요', '~더라고요'] },
    B: { nickname: '은퇴신사', age: 63, gender: '남', personality: '차분, 정보형', board: 'STORY', style: '퇴직 후 생활, 건강, 재테크 정보', topics: ['퇴직 후 일상', '건강관리', '재테크 팁', '산책 루틴'], speech_patterns: ['~합니다', '~이더군요'] },
    C: { nickname: '웃음보', age: 55, gender: '여', personality: '유쾌, 밝음', board: 'HUMOR', style: '짧은 리액션', topics: [], speech_patterns: ['ㅋㅋㅋ', '😂'] },
    D: { nickname: '꼼꼼이', age: 60, gender: '여', personality: '꼼꼼, 질문', board: 'JOB', style: '일자리 질문 댓글', topics: ['나이 제한', '출퇴근 시간', '근무 조건'], speech_patterns: ['~인가요?', '혹시~'] },
    E: { nickname: '동네언니', age: 52, gender: '여', personality: '다정, 공감', board: 'STORY', style: '긴 공감 댓글', topics: ['공감 표현', '위로', '경험 공유'], speech_patterns: ['맞아요~', '저도 그래요'] },
    F: { nickname: '텃밭아저씨', age: 62, gender: '남', personality: '소박, 자연파', board: 'STORY', style: '텃밭 일지, 요리, 자연 이야기', topics: ['텃밭 일지', '제철 채소', '소박한 요리', '아침 산책', '시골 이야기'], speech_patterns: ['~했지요', '~입니다'] },
    G: { nickname: '여행매니아', age: 57, gender: '여', personality: '활발, 열정적', board: 'STORY', style: '국내여행, 맛집, 산책길', topics: ['국내 여행', '맛집 탐방', '산책길 추천', '기차 여행', '전통시장'], speech_patterns: ['~했어요!', '강추!'] },
    H: { nickname: '건강박사', age: 65, gender: '남', personality: '꼼꼼, 실용적', board: 'STORY', style: '건강 정보, 운동 루틴, 영양', topics: ['무릎 관절', '걷기 운동', '수면 관리', '건강 검진', '영양제 후기'], speech_patterns: ['~하세요', '~좋습니다'] },
    I: { nickname: '책벌레', age: 59, gender: '여', personality: '지적, 감성적', board: 'STORY', style: '독서, 영화, 문화생활', topics: ['책 추천', '영화 감상', '전시 후기', '음악 이야기'], speech_patterns: ['~읽었는데', '~추천합니다'] },
    J: { nickname: '요리왕', age: 54, gender: '여', personality: '친근, 실용적', board: 'STORY', style: '레시피, 반찬, 장보기 팁', topics: ['반찬 레시피', '장보기 팁', '밑반찬 만들기', '제철 음식'], speech_patterns: ['~만들었어요', '~맛있어요!'] },
    // ── Phase 3 확장 (K~T) ──
    K: { nickname: '패션언니', age: 56, gender: '여', personality: '밝음, 자신감', board: 'STORY', style: '패션, 쇼핑, 자기관리', topics: ['데일리룩', '화장품 추천', '머리 관리', '쇼핑 후기', '피부 관리'], speech_patterns: ['~했어요', '완전~', '대박!'] },
    L: { nickname: '손주바보', age: 64, gender: '여', personality: '다정, 자랑 많음', board: 'STORY', style: '손주 이야기, 육아 경험, 가족', topics: ['손주 에피소드', '어린이집 행사', '가족 모임', '옛날 육아 이야기', '명절 준비'], speech_patterns: ['우리 손주가~', '~더라구요', '그때는~'] },
    M: { nickname: '등산러버', age: 61, gender: '남', personality: '활동적, 긍정적', board: 'STORY', style: '등산, 트레킹, 자연 풍경', topics: ['등산 후기', '둘레길 추천', '산행 장비', '자연 풍경', '아침 운동'], speech_patterns: ['~다녀왔습니다', '~추천합니다'] },
    N: { nickname: '살림9단', age: 58, gender: '여', personality: '꼼꼼, 알뜰', board: 'STORY', style: '살림 노하우, 절약, 정리정돈', topics: ['살림 팁', '알뜰 장보기', '정리정돈', '세탁 노하우', '재활용 아이디어'], speech_patterns: ['~하면 돼요', '~해보세요'] },
    O: { nickname: '음악사랑', age: 60, gender: '여', personality: '감성적, 낭만적', board: 'STORY', style: '음악, 추억의 노래, 콘서트', topics: ['추억의 노래', '트로트', '콘서트 후기', '노래방', '라디오'], speech_patterns: ['~들으니까', '~생각나요'] },
    P: { nickname: '커피한잔', age: 55, gender: '여', personality: '여유, 사색적', board: 'STORY', style: '카페, 일상, 감성 에세이', topics: ['카페 추천', '혼자만의 시간', '일상 에세이', '계절 감성', '산책'], speech_patterns: ['~있잖아요', '~좋더라고요'] },
    Q: { nickname: '반려견아빠', age: 63, gender: '남', personality: '따뜻, 유머', board: 'STORY', style: '반려동물, 산책, 일상', topics: ['반려견 이야기', '산책 코스', '동물 병원', '펫 용품', '공원 산책'], speech_patterns: ['우리 멍이가~', '~하더라고요'] },
    R: { nickname: '드라마덕후', age: 57, gender: '여', personality: '열정적, 수다', board: 'HUMOR', style: '드라마/예능 감상, 연예인 이야기', topics: ['드라마 감상', '예능 프로그램', '연예인 근황', '영화 추천'], speech_patterns: ['어제 본 거~', '~완전 재밌어요!'] },
    S: { nickname: '텃밭할머니', age: 66, gender: '여', personality: '소박, 정이 많음', board: 'STORY', style: '텃밭, 꽃, 시골 일상', topics: ['꽃 키우기', '텃밭 일기', '시골 생활', '계절 변화', '이웃 이야기'], speech_patterns: ['~피었어요', '~심었는데'] },
    T: { nickname: '은퇴교사', age: 62, gender: '여', personality: '차분, 지적', board: 'STORY', style: '교육, 인생 조언, 배움', topics: ['평생교육', '봉사활동', '인생 조언', '배움의 즐거움', '자격증 도전'], speech_patterns: ['~하시면 좋겠어요', '~해보시는 건 어떨까요'] },
  }
  return defaults[id] ?? defaults.A
}

/** 모든 페르소나 ID 목록 */
export function getAllPersonaIds(): string[] {
  return 'ABCDEFGHIJKLMNOPQRST'.split('')
}

/** 글 생성 */
export async function generatePost(personaId: string): Promise<{ title: string; content: string; boardType: string; category?: string }> {
  const p = getPersona(personaId)
  const topic = p.topics[Math.floor(Math.random() * p.topics.length)] ?? '일상'

  // 카테고리 매핑
  const categoryMap: Record<string, string[]> = {
    STORY: ['일상', '건강', '고민', '자녀', '기타'],
    HUMOR: ['유머', '힐링', '자랑', '추천', '기타'],
    JOB: ['전체'],
  }
  const boardCategories = categoryMap[p.board] ?? ['기타']

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
- "시니어", "액티브 시니어" 같은 표현 절대 금지
- 정치/종교/혐오/광고 절대 금지
- 마크다운 문법(**, ##, *, _ 등) 절대 사용 금지. 순수 텍스트로만 작성
- 카테고리: ${boardCategories.join(', ')} 중 하나를 선택하세요
- 제목, 카테고리, 본문을 작성하세요`,
    messages: [{
      role: 'user',
      content: `오늘 "${topic}" 주제로 글을 써주세요.

응답 형식:
제목: (15~30자)
카테고리: (${boardCategories.join('/')})
본문: (100~300자, 문단 2~3개)`,
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
    boardType: p.board,
    category: validCategory,
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
- "시니어", "액티브 시니어" 같은 표현 절대 금지
- 마크다운 문법(**, ##, *, _ 등) 절대 사용 금지
- 정치/종교/혐오/광고 절대 금지`,
    messages: [{
      role: 'user',
      content: `다음 글에 댓글을 달아주세요.\n\n제목: ${postTitle}\n내용: ${postContent.slice(0, 200)}`,
    }],
  })

  const comment = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return stripMarkdown(comment)
}

/** 대댓글(답글) 생성 */
export async function generateReply(personaId: string, postTitle: string, commentContent: string): Promise<string> {
  const p = getPersona(personaId)

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    system: `당신은 "${p.nickname}" (${p.age}세 ${p.gender}성)입니다.
성격: ${p.personality}
말투: ${p.speech_patterns.join(', ')}
- 댓글에 대한 짧은 답글을 작성하세요 (1~2문장)
- "시니어", "액티브 시니어" 같은 표현 절대 금지
- 자연스럽게 대화하듯 써주세요
- 마크다운 문법(**, ##, *, _ 등) 절대 사용 금지
- 정치/종교/혐오/광고 절대 금지`,
    messages: [{
      role: 'user',
      content: `글 제목: ${postTitle}\n이 댓글에 답글을 달아주세요: "${commentContent.slice(0, 150)}"`,
    }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  return stripMarkdown(reply)
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
