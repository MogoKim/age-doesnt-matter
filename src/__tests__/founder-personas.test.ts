import { describe, it, expect } from 'vitest'
import {
  FOUNDER_PERSONAS,
  FOUNDER_PERSONA_BOARD_TYPES,
  FOUNDER_PERSONA_SLUG_BOARD_TYPES,
  FOUNDER_PERSONA_TITLE_MAX,
  findFounderPersona,
  needsCommunitySlug,
  personaAllowsBoard,
  validateFounderPersonaInput,
} from '@/lib/founder-personas'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

const VALID = {
  personaId: 'official',
  boardType: 'STORY',
  title: '오늘 아침에 있었던 일',
  content: '아침부터 비가 와서 한참을 서 있었어요. 별것 아닌데 기분이 묘하더라고요.',
}

describe('창업자 페르소나 카탈로그', () => {
  it('id와 accountEmail이 서로 겹치지 않는다', () => {
    const ids = FOUNDER_PERSONAS.map((p) => p.id)
    const emails = FOUNDER_PERSONAS.map((p) => p.accountEmail)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(emails).size).toBe(emails.length)
  })

  it('모든 계정이 @unao.bot 네임스페이스다 — 실회원 계정으로 발행되지 않게', () => {
    for (const p of FOUNDER_PERSONAS) {
      expect(p.accountEmail.endsWith('@unao.bot')).toBe(true)
    }
  })

  it('모든 페르소나는 허용 게시판을 최소 1개 가지며, 전부 허용 목록 안이다', () => {
    for (const p of FOUNDER_PERSONAS) {
      expect(p.boardTypes.length).toBeGreaterThan(0)
      for (const b of p.boardTypes) {
        expect(FOUNDER_PERSONA_BOARD_TYPES).toContain(b)
      }
    }
  })

  it('허용 게시판은 모두 board-registry에 URL 접두사가 있다 (발행 후 링크·revalidate 대상)', () => {
    for (const b of FOUNDER_PERSONA_BOARD_TYPES) {
      expect(BOARD_URL_PREFIX[b]).toBeTruthy()
    }
  })

  it('브랜드 금지어(시니어·어르신·노인·실버)를 표시 문구에 쓰지 않는다', () => {
    const banned = ['시니어', '어르신', '노인', '실버']
    for (const p of FOUNDER_PERSONAS) {
      const text = `${p.displayName} ${p.voice}`
      for (const word of banned) {
        expect(text).not.toContain(word)
      }
    }
  })

  it('slug 생성 게시판은 회원 createPost와 같은 STORY/HUMOR/LIFE2다', () => {
    expect([...FOUNDER_PERSONA_SLUG_BOARD_TYPES].sort()).toEqual(['HUMOR', 'LIFE2', 'STORY'])
    expect(needsCommunitySlug('MENOPAUSE')).toBe(false)
    expect(needsCommunitySlug('STORY')).toBe(true)
  })

  it('findFounderPersona / personaAllowsBoard', () => {
    const official = findFounderPersona('official')
    expect(official?.accountEmail).toBe('official@unao.bot')
    expect(findFounderPersona('nope')).toBeUndefined()
    expect(personaAllowsBoard(official!, 'STORY')).toBe(true)
    expect(personaAllowsBoard(official!, 'HUMOR')).toBe(false)
  })
})

describe('validateFounderPersonaInput', () => {
  it('정상 입력은 통과하고 제목·본문을 trim한다', () => {
    const r = validateFounderPersonaInput({ ...VALID, title: `  ${VALID.title}  ` })
    expect('ok' in r).toBe(true)
    if ('ok' in r) {
      expect(r.ok.title).toBe(VALID.title)
      expect(r.ok.persona.id).toBe('official')
      expect(r.ok.boardType).toBe('STORY')
    }
  })

  it('없는 페르소나는 거부', () => {
    const r = validateFounderPersonaInput({ ...VALID, personaId: 'ghost' })
    expect(r).toEqual({ error: '존재하지 않는 페르소나입니다' })
  })

  it('허용 목록 밖 게시판(MAGAZINE·JOB)은 거부', () => {
    for (const boardType of ['MAGAZINE', 'JOB', 'WEEKLY']) {
      const r = validateFounderPersonaInput({ ...VALID, boardType })
      expect(r).toEqual({ error: '이 화면에서 사용할 수 없는 게시판입니다' })
    }
  })

  it('페르소나가 쓸 수 없는 게시판은 거부', () => {
    const r = validateFounderPersonaInput({ ...VALID, boardType: 'HUMOR' })
    expect('error' in r && r.error).toContain('이 게시판에 쓸 수 없습니다')
  })

  it('제목 길이 경계', () => {
    expect('error' in validateFounderPersonaInput({ ...VALID, title: 'ㄱ' })).toBe(true)
    const tooLong = 'ㄱ'.repeat(FOUNDER_PERSONA_TITLE_MAX + 1)
    expect('error' in validateFounderPersonaInput({ ...VALID, title: tooLong })).toBe(true)
    const exact = 'ㄱ'.repeat(FOUNDER_PERSONA_TITLE_MAX)
    expect('ok' in validateFounderPersonaInput({ ...VALID, title: exact })).toBe(true)
  })

  it('본문 10자 미만은 거부 — 공백만 채운 경우 포함', () => {
    expect('error' in validateFounderPersonaInput({ ...VALID, content: '짧아요' })).toBe(true)
    expect('error' in validateFounderPersonaInput({ ...VALID, content: '          ' })).toBe(true)
  })
})
