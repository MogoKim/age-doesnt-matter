/**
 * 창업자 페르소나 카탈로그 (SSoT)
 *
 * 창업자가 어드민에서 직접 쓴 글을 어느 커뮤니티 계정 이름으로 올릴지 정의한다.
 *
 * 설계 원칙 (창업자 판정 2026-09-10):
 *  - 이 파일은 **정적 카탈로그**다. 실제 작성자(User.id)는 발행 시점에 accountEmail로
 *    DB를 조회해 확정한다 — vote-events의 OFFICIAL_VOTE_AUTHOR 해석 패턴과 동일.
 *  - **계정 자동 생성 금지.** accountEmail에 해당하는 @unao.bot User가 없거나 ACTIVE가
 *    아니면 해당 페르소나는 어드민 화면에서 선택 불가로 표시된다.
 *  - 본문은 창업자가 직접 입력한다. AI 초안 생성은 이 기능의 범위가 아니다.
 *
 * 페르소나 추가/변경 시 이 배열만 고치면 어드민 화면·서버 액션이 함께 따라간다.
 * 단, 새 accountEmail을 쓰려면 해당 @unao.bot User 계정을 DB에 먼저 만들어야 한다
 * (운영 핸드오프 — `/prisma-guide` 절차. Prisma CLI 마이그레이션은 쓰지 않는다).
 *
 * ⚠️ 브랜드 규칙: 표시명·톤 안내에 "시니어/어르신/노인/실버"를 쓰지 않는다.
 */
import type { BoardTypeId } from '@/lib/board-registry'

/**
 * 페르소나 발행을 허용하는 게시판.
 * 커뮤니티 4종으로 제한한다 — MAGAZINE(시리즈·전용 SEO 파이프라인)과
 * JOB(JobDetail 종속)은 별도 작성 경로가 있어 이 화면의 범위가 아니다.
 */
export const FOUNDER_PERSONA_BOARD_TYPES = [
  'STORY',
  'LIFE2',
  'MENOPAUSE',
  'HUMOR',
] as const satisfies readonly BoardTypeId[]

export type FounderPersonaBoardType = (typeof FOUNDER_PERSONA_BOARD_TYPES)[number]

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

export interface FounderPersona {
  /** 폼·서버 액션이 주고받는 식별자 */
  id: string
  /** 어드민 화면에 보이는 페르소나 이름 (실제 표시 닉네임은 DB User.nickname) */
  displayName: string
  /** DB User.email — 이 값으로 작성자 계정을 조회한다 */
  accountEmail: string
  /** 이 페르소나로 글을 올릴 수 있는 게시판 */
  boardTypes: readonly FounderPersonaBoardType[]
  /** 작성 톤 가이드 — 화면 안내문으로만 쓰인다(저장되지 않음) */
  voice: string
}

export const FOUNDER_PERSONAS = [
  {
    id: 'official',
    displayName: '공식 계정',
    accountEmail: 'official@unao.bot',
    boardTypes: ['STORY', 'LIFE2', 'MENOPAUSE'],
    voice: '운영자 목소리. 공지·안내·정리글에 쓴다. 단정적 약속이나 과장은 피한다.',
  },
  {
    id: 'life2',
    displayName: '인생 2막 이야기',
    accountEmail: 'founder-life2@unao.bot',
    boardTypes: ['LIFE2', 'STORY'],
    voice: '퇴직·재취업·새 배움처럼 2막을 준비하는 우리 또래의 경험담. 조언보다 자기 이야기로.',
  },
  {
    id: 'money',
    displayName: '돈과 일 이야기',
    accountEmail: 'founder-money@unao.bot',
    boardTypes: ['STORY', 'LIFE2'],
    voice: '살림·목돈·일자리 고민을 숫자와 함께 담백하게. 투자 권유·수익 보장 표현은 금지.',
  },
  {
    id: 'body',
    displayName: '몸과 마음 이야기',
    accountEmail: 'founder-body@unao.bot',
    boardTypes: ['MENOPAUSE', 'STORY'],
    voice: '갱년기·수면·체력 변화를 겪은 그대로. 의학적 단정이나 치료 효과 주장은 금지.',
  },
  {
    id: 'humor',
    displayName: '웃음 한 조각',
    accountEmail: 'founder-humor@unao.bot',
    boardTypes: ['HUMOR'],
    voice: '짧고 가볍게. 특정인·집단을 깎아내리는 소재는 쓰지 않는다.',
  },
] as const satisfies readonly FounderPersona[]

export type FounderPersonaId = (typeof FOUNDER_PERSONAS)[number]['id']

/** 제목/본문 제약 — 회원 createPost와 동일하게 맞춘다(운영 일관성). */
export const FOUNDER_PERSONA_TITLE_MIN = 2
export const FOUNDER_PERSONA_TITLE_MAX = 40
export const FOUNDER_PERSONA_CONTENT_MIN = 10

export function findFounderPersona(id: string): FounderPersona | undefined {
  return FOUNDER_PERSONAS.find((p) => p.id === id)
}

export function isFounderPersonaBoardType(value: string): value is FounderPersonaBoardType {
  return (FOUNDER_PERSONA_BOARD_TYPES as readonly string[]).includes(value)
}

/** 해당 게시판이 커뮤니티 slug 생성 대상인지 */
export function needsCommunitySlug(boardType: FounderPersonaBoardType): boolean {
  return (FOUNDER_PERSONA_SLUG_BOARD_TYPES as readonly string[]).includes(boardType)
}

/** 페르소나가 그 게시판에 글을 올릴 수 있는지 */
export function personaAllowsBoard(persona: FounderPersona, boardType: string): boolean {
  return (persona.boardTypes as readonly string[]).includes(boardType)
}

export interface FounderPersonaInput {
  personaId: string
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
  const persona = findFounderPersona(input.personaId)
  if (!persona) return { error: '존재하지 않는 페르소나입니다' }

  if (!isFounderPersonaBoardType(input.boardType)) {
    return { error: '이 화면에서 사용할 수 없는 게시판입니다' }
  }
  if (!personaAllowsBoard(persona, input.boardType)) {
    return { error: `${persona.displayName}은(는) 이 게시판에 쓸 수 없습니다` }
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
