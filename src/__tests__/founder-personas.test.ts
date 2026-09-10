import { describe, it, expect } from 'vitest'
import {
  FOUNDER_PERSONA_BOARD_TYPES,
  FOUNDER_PERSONA_CANDIDATES,
  FOUNDER_PERSONA_EMAILS,
  FOUNDER_PERSONA_SLUG_BOARD_TYPES,
  FOUNDER_PERSONA_TITLE_MAX,
  findFounderPersonaCandidate,
  isFounderPersonaEmail,
  needsCommunitySlug,
  normalizeFounderPersonaTitle,
  validateFounderPersonaInput,
} from '@/lib/founder-personas'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

const VALID = {
  personaEmail: 'bot-a@unao.bot',
  boardType: 'STORY',
  title: '오늘 아침에 있었던 일',
  content: '아침부터 비가 와서 한참을 서 있었어요. 별것 아닌데 기분이 묘하더라고요.',
}

describe('후보 카탈로그 — 제거된 persona registry에서 canWritePost=true였던 계정만', () => {
  it('289종 (seed 64 + curator 225)', () => {
    expect(FOUNDER_PERSONA_CANDIDATES.length).toBe(289)
    expect(FOUNDER_PERSONA_CANDIDATES.filter((c) => c.origin === 'seed').length).toBe(64)
    expect(FOUNDER_PERSONA_CANDIDATES.filter((c) => c.origin === 'curator').length).toBe(225)
  })

  it('이메일이 중복되지 않는다', () => {
    expect(new Set(FOUNDER_PERSONA_EMAILS).size).toBe(FOUNDER_PERSONA_EMAILS.length)
  })

  it('전부 bot-* 또는 curator-* @unao.bot 네임스페이스다', () => {
    for (const c of FOUNDER_PERSONA_CANDIDATES) {
      expect(c.email).toMatch(/^(bot|curator)-[a-z0-9]+@unao\.bot$/)
    }
  })

  it('official@unao.bot은 후보가 아니다 — 페르소나가 아니라 운영 공식 계정', () => {
    expect(isFounderPersonaEmail('official@unao.bot')).toBe(false)
  })

  it('신규 founder-* 계정은 후보가 아니다 — 계정을 새로 만들지 않는다', () => {
    for (const email of [
      'founder-life2@unao.bot',
      'founder-money@unao.bot',
      'founder-body@unao.bot',
      'founder-humor@unao.bot',
    ]) {
      expect(isFounderPersonaEmail(email)).toBe(false)
    }
    expect(FOUNDER_PERSONA_EMAILS.some((e) => e.startsWith('founder-'))).toBe(false)
  })

  it('스크래퍼봇(canWritePost=false, REACTION_ONLY_KEYS BI~BW)은 제외됐다', () => {
    for (const key of ['bi', 'bj', 'bk', 'bl', 'bm', 'bn', 'bo', 'bp', 'bq', 'br', 'bs', 'bt', 'bu', 'bv', 'bw']) {
      expect(isFounderPersonaEmail(`bot-${key}@unao.bot`)).toBe(false)
    }
  })

  it('system feed 봇(bot-job 등)은 제외됐다 — role=system_feed', () => {
    expect(isFounderPersonaEmail('bot-job@unao.bot')).toBe(false)
  })

  it('registryBoard는 모두 board-registry에 존재하는 BoardType이다', () => {
    for (const c of FOUNDER_PERSONA_CANDIDATES) {
      expect(BOARD_URL_PREFIX[c.registryBoard as keyof typeof BOARD_URL_PREFIX]).toBeTruthy()
    }
  })

  it('findFounderPersonaCandidate / isFounderPersonaEmail', () => {
    expect(findFounderPersonaCandidate('bot-a@unao.bot')?.origin).toBe('seed')
    expect(findFounderPersonaCandidate('curator-a@unao.bot')?.origin).toBe('curator')
    expect(findFounderPersonaCandidate('nope@unao.bot')).toBeUndefined()
    expect(isFounderPersonaEmail('bot-a@unao.bot')).toBe(true)
  })
})

describe('게시판 규칙', () => {
  it('허용 게시판은 커뮤니티 4종이고 모두 URL 접두사가 있다', () => {
    expect([...FOUNDER_PERSONA_BOARD_TYPES].sort()).toEqual([
      'HUMOR',
      'LIFE2',
      'MENOPAUSE',
      'STORY',
    ])
    for (const b of FOUNDER_PERSONA_BOARD_TYPES) {
      expect(BOARD_URL_PREFIX[b]).toBeTruthy()
    }
  })

  it('slug 생성 게시판은 회원 createPost와 같은 STORY/HUMOR/LIFE2다', () => {
    expect([...FOUNDER_PERSONA_SLUG_BOARD_TYPES].sort()).toEqual(['HUMOR', 'LIFE2', 'STORY'])
    expect(needsCommunitySlug('MENOPAUSE')).toBe(false)
    expect(needsCommunitySlug('STORY')).toBe(true)
  })
})

describe('normalizeFounderPersonaTitle — 중복 판정 키', () => {
  it('앞뒤 공백·연속 공백·대소문자 차이를 흡수한다', () => {
    expect(normalizeFounderPersonaTitle('  오늘   아침 ')).toBe('오늘 아침')
    expect(normalizeFounderPersonaTitle('Hello  World')).toBe('hello world')
  })

  it('유니코드 합성 형태(NFD/NFC)가 달라도 같은 키가 된다', () => {
    const nfc = '한글'.normalize('NFC')
    const nfd = '한글'.normalize('NFD')
    expect(nfd).not.toBe(nfc)
    expect(normalizeFounderPersonaTitle(nfd)).toBe(normalizeFounderPersonaTitle(nfc))
  })

  it('내용이 다르면 다른 키다', () => {
    expect(normalizeFounderPersonaTitle('아침 산책')).not.toBe(
      normalizeFounderPersonaTitle('저녁 산책'),
    )
  })
})

describe('validateFounderPersonaInput', () => {
  it('정상 입력은 통과하고 제목·본문을 trim한다', () => {
    const r = validateFounderPersonaInput({ ...VALID, title: `  ${VALID.title}  ` })
    expect('ok' in r).toBe(true)
    if ('ok' in r) {
      expect(r.ok.title).toBe(VALID.title)
      expect(r.ok.candidate.email).toBe('bot-a@unao.bot')
      expect(r.ok.boardType).toBe('STORY')
    }
  })

  it('후보 목록 밖 이메일은 거부 — 실회원·official·신규 계정 전부', () => {
    for (const personaEmail of ['someone@kakao.com', 'official@unao.bot', 'founder-life2@unao.bot']) {
      expect(validateFounderPersonaInput({ ...VALID, personaEmail })).toEqual({
        error: '후보 목록에 없는 페르소나입니다',
      })
    }
  })

  it('허용 목록 밖 게시판(MAGAZINE·JOB·WEEKLY)은 거부', () => {
    for (const boardType of ['MAGAZINE', 'JOB', 'WEEKLY']) {
      expect(validateFounderPersonaInput({ ...VALID, boardType })).toEqual({
        error: '이 화면에서 사용할 수 없는 게시판입니다',
      })
    }
  })

  it('모든 후보는 4개 게시판 어디에나 쓸 수 있다 — registryBoard는 힌트일 뿐', () => {
    for (const boardType of FOUNDER_PERSONA_BOARD_TYPES) {
      expect('ok' in validateFounderPersonaInput({ ...VALID, boardType })).toBe(true)
    }
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
