import { describe, it, expect } from 'vitest'
import {
  FOUNDER_PERSONAS,
  FOUNDER_PERSONA_BOARD_TYPES,
  FOUNDER_PERSONA_EMAILS,
  FOUNDER_PERSONA_SLUG_BOARD_TYPES,
  FOUNDER_PERSONA_TITLE_MAX,
  findFounderPersona,
  isFounderPersonaEmail,
  needsCommunitySlug,
  normalizeFounderPersonaTitle,
  personaAllowsBoard,
  validateFounderPersonaInput,
} from '@/lib/founder-personas'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

const VALID = {
  personaEmail: 'bot-a@unao.bot',
  boardType: 'STORY',
  title: '오늘 아침에 있었던 일',
  content: '아침부터 비가 와서 한참을 서 있었어요. 별것 아닌데 기분이 묘하더라고요.',
}

/** 창업자가 확정한 운영 allowlist — 이 표가 바뀌면 테스트가 먼저 깨져야 한다 */
const EXPECTED = [
  { email: 'bot-a@unao.bot', roleLabel: '하늘바라기', boards: ['STORY', 'MENOPAUSE'] },
  { email: 'bot-b@unao.bot', roleLabel: '정순씨', boards: ['LIFE2', 'STORY'] },
  { email: 'bot-h@unao.bot', roleLabel: '만보걷기', boards: ['STORY', 'MENOPAUSE'] },
  { email: 'bot-n@unao.bot', roleLabel: '알뜰맘', boards: ['STORY', 'LIFE2'] },
  { email: 'bot-ay@unao.bot', roleLabel: '웃음보따리', boards: ['HUMOR'] },
]

describe('운영 allowlist', () => {
  it('정확히 5명이고, email·역할·허용 게시판이 확정값과 일치한다', () => {
    expect(FOUNDER_PERSONAS).toHaveLength(5)
    expect(
      FOUNDER_PERSONAS.map((p) => ({
        email: p.email,
        roleLabel: p.roleLabel,
        boards: [...p.allowedBoardTypes],
      })),
    ).toEqual(EXPECTED)
  })

  it('이메일이 중복되지 않고 전부 @unao.bot이다', () => {
    expect(new Set(FOUNDER_PERSONA_EMAILS).size).toBe(5)
    for (const p of FOUNDER_PERSONAS) {
      expect(p.email.endsWith('@unao.bot')).toBe(true)
    }
  })

  it('allowlist 밖 계정은 전부 거부된다 — 실회원·official·신규·다른 봇', () => {
    for (const email of [
      'someone@kakao.com',
      'official@unao.bot',
      'founder-life2@unao.bot',
      'bot-job@unao.bot',
      'curator-a@unao.bot',
      'bot-bi@unao.bot',
    ]) {
      expect(isFounderPersonaEmail(email)).toBe(false)
      expect(findFounderPersona(email)).toBeUndefined()
    }
  })

  it('카탈로그에 닉네임을 담지 않는다 — 표시 이름은 DB User.nickname이 정본', () => {
    for (const p of FOUNDER_PERSONAS) {
      expect(Object.keys(p).sort()).toEqual([
        'allowedBoardTypes',
        'email',
        'roleLabel',
        'voice',
      ])
    }
  })

  it('브랜드 금지어(시니어·어르신·노인·실버)를 라벨·톤 안내에 쓰지 않는다', () => {
    for (const p of FOUNDER_PERSONAS) {
      const text = `${p.roleLabel} ${p.voice}`
      for (const word of ['시니어', '어르신', '노인', '실버']) {
        expect(text).not.toContain(word)
      }
    }
  })
})

describe('게시판 규칙', () => {
  it('허용 게시판 전체 집합은 커뮤니티 4종이고 모두 URL 접두사가 있다', () => {
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

  it('페르소나별 allowedBoardTypes는 전체 집합의 부분집합이다', () => {
    for (const p of FOUNDER_PERSONAS) {
      expect(p.allowedBoardTypes.length).toBeGreaterThan(0)
      for (const b of p.allowedBoardTypes) {
        expect(FOUNDER_PERSONA_BOARD_TYPES).toContain(b)
      }
    }
  })

  it('personaAllowsBoard — 허용 목록 밖은 false', () => {
    const humorOnly = findFounderPersona('bot-ay@unao.bot')!
    expect(personaAllowsBoard(humorOnly, 'HUMOR')).toBe(true)
    expect(personaAllowsBoard(humorOnly, 'STORY')).toBe(false)
    expect(personaAllowsBoard(humorOnly, 'LIFE2')).toBe(false)
    expect(personaAllowsBoard(humorOnly, 'MENOPAUSE')).toBe(false)
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
      expect(r.ok.persona.email).toBe('bot-a@unao.bot')
      expect(r.ok.boardType).toBe('STORY')
    }
  })

  it('allowlist 밖 이메일은 거부', () => {
    expect(validateFounderPersonaInput({ ...VALID, personaEmail: 'curator-a@unao.bot' })).toEqual({
      error: '허용 목록에 없는 페르소나입니다',
    })
  })

  it('허용 목록 밖 게시판(MAGAZINE·JOB·WEEKLY)은 거부', () => {
    for (const boardType of ['MAGAZINE', 'JOB', 'WEEKLY']) {
      expect(validateFounderPersonaInput({ ...VALID, boardType })).toEqual({
        error: '이 화면에서 사용할 수 없는 게시판입니다',
      })
    }
  })

  it('페르소나별 허용 게시판만 통과한다', () => {
    for (const p of FOUNDER_PERSONAS) {
      for (const boardType of FOUNDER_PERSONA_BOARD_TYPES) {
        const r = validateFounderPersonaInput({ ...VALID, personaEmail: p.email, boardType })
        if ((p.allowedBoardTypes as readonly string[]).includes(boardType)) {
          expect('ok' in r).toBe(true)
        } else {
          expect('error' in r && r.error).toContain('이 게시판에 쓸 수 없습니다')
        }
      }
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
