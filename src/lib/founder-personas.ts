/**
 * 창업자 페르소나 발행 — 운영 allowlist (SSoT)
 *
 * 창업자가 **직접 쓴** 제목·본문을 이미 존재하는 페르소나 봇 계정 이름으로 발행할 때 쓰는
 * 목록이다. 창업자가 실제로 굴릴 소수 페르소나만 둔다 — 후보를 넓게 열지 않는다.
 *
 * ## 규칙
 *  - **계정을 만들지 않는다.** 여기 있는 건 allowlist일 뿐이고, 실제 선택 가능 여부는
 *    발행 시점에 DB에서 `status='ACTIVE'`인 User가 있는지로 결정된다.
 *  - **닉네임은 여기 두지 않는다.** 화면에 보이는 이름은 언제나 DB `User.nickname`이 정본이다.
 *    아래 `roleLabel`은 "어떤 역할로 쓰는 계정인가"를 창업자가 알아보기 위한 운영 라벨이다.
 *  - `allowedBoardTypes`는 **서버에서 강제**한다(화면 필터만으로 두지 않는다).
 *
 * ⚠️ 브랜드 규칙: 라벨·톤 안내에 "시니어/어르신/노인/실버"를 쓰지 않는다.
 */

import type { BoardTypeId } from '@/lib/board-registry'

/**
 * 페르소나 발행을 허용하는 게시판(전체 집합).
 * 커뮤니티 4종으로 제한한다 — MAGAZINE(시리즈·전용 SEO 파이프라인)과
 * JOB(JobDetail 종속)은 별도 작성 경로가 있어 이 화면의 범위가 아니다.
 * 개별 페르소나가 실제로 쓸 수 있는 게시판은 `allowedBoardTypes`가 따로 정한다.
 */
export const FOUNDER_PERSONA_BOARD_TYPES = [
  'STORY',
  'LIFE2',
  'MENOPAUSE',
  'HUMOR',
] as const satisfies readonly BoardTypeId[]

export type FounderPersonaBoardType = (typeof FOUNDER_PERSONA_BOARD_TYPES)[number]

export interface FounderPersona {
  /** DB User.email — 이 값으로만 계정을 조회한다(생성하지 않는다) */
  email: string
  /** 운영 라벨 — 어떤 역할로 쓰는 계정인지. 화면 표시 이름이 아니다(그건 DB nickname). */
  roleLabel: string
  /** 작성 톤 안내 — 화면 안내문으로만 쓰이고 저장되지 않는다 */
  voice: string
  /** 이 페르소나로 글을 올릴 수 있는 게시판 — 서버 액션이 강제한다 */
  allowedBoardTypes: readonly FounderPersonaBoardType[]
}

export const FOUNDER_PERSONAS = [
  {
    email: 'bot-a@unao.bot',
    roleLabel: '하늘바라기',
    voice: '동네·시장·날씨 같은 일상 수다. 큰 주제 말고 오늘 있었던 작은 일로.',
    allowedBoardTypes: ['STORY', 'MENOPAUSE'],
  },
  {
    email: 'bot-b@unao.bot',
    roleLabel: '정순씨',
    voice: '일기체 · 합니다체. 퇴직 이후의 하루를 담담하게 적는다.',
    allowedBoardTypes: ['LIFE2', 'STORY'],
  },
  {
    email: 'bot-h@unao.bot',
    roleLabel: '만보걷기',
    voice: '걸음 수·체력 변화를 숫자와 함께. 의학적 단정이나 치료 효과 주장은 금지.',
    allowedBoardTypes: ['STORY', 'MENOPAUSE'],
  },
  {
    email: 'bot-n@unao.bot',
    roleLabel: '알뜰맘',
    voice: '살림 팁·가격 비교를 구체적인 숫자로. 투자 권유·수익 보장 표현은 금지.',
    allowedBoardTypes: ['STORY', 'LIFE2'],
  },
  {
    email: 'bot-ay@unao.bot',
    roleLabel: '웃음보따리',
    voice: '짧고 가볍게. 특정인·집단을 깎아내리는 소재는 쓰지 않는다.',
    allowedBoardTypes: ['HUMOR'],
  },
] as const satisfies readonly FounderPersona[]

/** allowlist 이메일 — DB 조회 `where email in (...)` 에 그대로 쓴다 */
export const FOUNDER_PERSONA_EMAILS: readonly string[] = FOUNDER_PERSONAS.map((p) => p.email)

const PERSONA_BY_EMAIL = new Map<string, FounderPersona>(
  FOUNDER_PERSONAS.map((p) => [p.email, p]),
)

export function findFounderPersona(email: string): FounderPersona | undefined {
  return PERSONA_BY_EMAIL.get(email)
}

export function isFounderPersonaEmail(email: string): boolean {
  return PERSONA_BY_EMAIL.has(email)
}

export function personaAllowsBoard(persona: FounderPersona, boardType: string): boolean {
  return (persona.allowedBoardTypes as readonly string[]).includes(boardType)
}

/**
 * 커뮤니티 slug를 생성하는 게시판.
 * `src/lib/actions/posts.ts` createPost의 COMMUNITY_BOARD_TYPES와 **같은 값이어야 한다**
 * (MENOPAUSE는 slug 없이 id 기반 URL — 회원 글과 동일하게 맞춘다).
 */
export const FOUNDER_PERSONA_SLUG_BOARD_TYPES = [
  'STORY',
  'HUMOR',
  'LIFE2',
] as const satisfies readonly FounderPersonaBoardType[]

/** 제목/본문 제약 — 회원 createPost와 동일하게 맞춘다(운영 일관성). */
export const FOUNDER_PERSONA_TITLE_MIN = 2
export const FOUNDER_PERSONA_TITLE_MAX = 40
export const FOUNDER_PERSONA_CONTENT_MIN = 10

/**
 * 중복 발행 판정 창(10분).
 * 연속 클릭·네트워크 재시도·서버 액션 자동 재요청을 모두 덮을 만큼 넉넉하되,
 * 같은 페르소나가 같은 게시판에 "제목·본문이 글자까지 같은 글"을 10분 안에 두 번 쓸 일은 없다.
 */
export const FOUNDER_PERSONA_DUPLICATE_WINDOW_MS = 10 * 60 * 1000

export function isFounderPersonaBoardType(value: string): value is FounderPersonaBoardType {
  return (FOUNDER_PERSONA_BOARD_TYPES as readonly string[]).includes(value)
}

/** 해당 게시판이 커뮤니티 slug 생성 대상인지 */
export function needsCommunitySlug(boardType: FounderPersonaBoardType): boolean {
  return (FOUNDER_PERSONA_SLUG_BOARD_TYPES as readonly string[]).includes(boardType)
}

/**
 * 중복 판정용 제목 정규화.
 * 재요청 사이에 앞뒤 공백·연속 공백·유니코드 합성 형태만 달라지는 경우를 같은 제목으로 본다.
 * DB에 저장되는 title은 정규화하지 않는다 — 판정에만 쓴다.
 */
export function normalizeFounderPersonaTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export interface FounderPersonaInput {
  /** allowlist의 email — 폼이 주고받는 페르소나 식별자 */
  personaEmail: string
  boardType: string
  title: string
  content: string
}

export interface FounderPersonaValidated {
  persona: FounderPersona
  boardType: FounderPersonaBoardType
  title: string
  content: string
}

/**
 * 폼 입력 검증 — DB 접근이 없는 순수 함수라 클라이언트/서버 양쪽에서 같은 규칙을 쓴다.
 * 계정 존재·ACTIVE 여부는 여기서 판단하지 않는다(서버 액션의 DB 조회 단계 몫).
 */
export function validateFounderPersonaInput(
  input: FounderPersonaInput,
): { error: string } | { ok: FounderPersonaValidated } {
  const persona = findFounderPersona(input.personaEmail)
  if (!persona) return { error: '허용 목록에 없는 페르소나입니다' }

  if (!isFounderPersonaBoardType(input.boardType)) {
    return { error: '이 화면에서 사용할 수 없는 게시판입니다' }
  }
  if (!personaAllowsBoard(persona, input.boardType)) {
    return { error: `${persona.roleLabel} 페르소나는 이 게시판에 쓸 수 없습니다` }
  }

  const title = input.title.trim()
  if (title.length < FOUNDER_PERSONA_TITLE_MIN || title.length > FOUNDER_PERSONA_TITLE_MAX) {
    return {
      error: `제목은 ${FOUNDER_PERSONA_TITLE_MIN}~${FOUNDER_PERSONA_TITLE_MAX}자로 입력해 주세요`,
    }
  }

  const content = input.content.trim()
  if (content.length < FOUNDER_PERSONA_CONTENT_MIN) {
    return { error: `본문은 ${FOUNDER_PERSONA_CONTENT_MIN}자 이상 입력해 주세요` }
  }

  return { ok: { persona, boardType: input.boardType, title, content } }
}
