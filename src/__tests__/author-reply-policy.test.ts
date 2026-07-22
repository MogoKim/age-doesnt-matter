import { describe, it, expect } from 'vitest'
import {
  findIneligibleReason,
  buildAuthorReplyPrompt,
  parseAuthorReplyDecision,
  resolveAuthorReplyMode,
  shouldWriteReply,
  NON_BOT_COMMENT_AUTHOR_WHERE,
  type CandidateInput,
  type AuthorReplyVerdict,
} from '../../agents/coo/author-reply-policy'
import { resolveAuthorPersonaContext } from '../../agents/coo/author-reply-persona'

/** 작성자 봇 대댓글 dry-run — 구조 필터·프롬프트·파서·페르소나 역추적 고정 */

describe('NON_BOT_COMMENT_AUTHOR_WHERE — 후보 조회 상류 잘림 hotfix (봇 댓글 DB단 제외)', () => {
  // Prisma where 의미를 재현하는 순수 평가기 — 조건 계약을 케이스로 고정
  type CommentLike = { authorId: string | null; guestNickname: string | null; authorEmail: string | null }
  const matches = (c: CommentLike): boolean =>
    NON_BOT_COMMENT_AUTHOR_WHERE.OR.some(branch => {
      if ('authorId' in branch) return c.authorId === null && c.guestNickname !== null
      // author.is 브랜치는 관계 존재(회원 댓글)가 전제
      if (c.authorId === null) return false
      const emailCond = branch.author.is.email
      if (emailCond === null) return c.authorEmail === null
      // not endsWith — Prisma 문자열 필터는 null을 매칭하지 않음
      return c.authorEmail !== null && !c.authorEmail.endsWith(emailCond.not.endsWith)
    })

  it('봇 댓글(@unao.bot)은 후보 조회에서 제외', () => {
    expect(matches({ authorId: 'u1', guestNickname: null, authorEmail: 'bot-a@unao.bot' })).toBe(false)
    expect(matches({ authorId: 'u2', guestNickname: null, authorEmail: 'curator-s028@unao.bot' })).toBe(false)
  })
  it('게스트 댓글(authorId null + guestNickname 존재)은 유지', () => {
    expect(matches({ authorId: null, guestNickname: '나그네', authorEmail: null })).toBe(true)
  })
  it('작성자 정보가 아예 없는 댓글은 후보 아님 (구조 필터 NO_COMMENT_AUTHOR와 정합)', () => {
    expect(matches({ authorId: null, guestNickname: null, authorEmail: null })).toBe(false)
  })
  it('실회원 댓글(일반 이메일 또는 이메일 없음)은 유지', () => {
    expect(matches({ authorId: 'u3', guestNickname: null, authorEmail: 'someone@gmail.com' })).toBe(true)
    expect(matches({ authorId: 'u4', guestNickname: null, authorEmail: null })).toBe(true)
  })
  it('글(post) 작성자 조건은 걸지 않음 — curator-* 작성글의 실회원 댓글도 후보에 남음', () => {
    // where가 댓글 작성자 필드만 참조하는지 계약 고정 (post 조건이 섞이면 curator 글 후보가 다시 잘린다)
    expect(JSON.stringify(NON_BOT_COMMENT_AUTHOR_WHERE)).not.toContain('post')
    expect(matches({ authorId: 'real-user', guestNickname: null, authorEmail: 'member@naver.com' })).toBe(true)
  })
})

describe('resolveAuthorPersonaContext — bot-*/curator-* 양 체계 역추적 (사각 15% 해소)', () => {
  it('bot-a@unao.bot → persona-data A 정상 변환 (기존 동작 회귀 0)', () => {
    const p = resolveAuthorPersonaContext('bot-a@unao.bot')
    expect(p).not.toBeNull()
    expect(p?.personaId).toBe('A')
    expect(p?.nickname).toBeTruthy()
    expect(p?.personality).toBeTruthy()
    expect(Array.isArray(p?.speechPatterns)).toBe(true)
  })

  it('curator-a@unao.bot → curator PERSONAS A 변환 (신규 지원)', () => {
    const p = resolveAuthorPersonaContext('curator-a@unao.bot')
    expect(p).not.toBeNull()
    expect(p?.personaId).toBe('curator-A')
    expect(p?.nickname).toBe('새날바라기')
    expect(p?.personality).toContain('습관')
    expect(p?.speechPatterns.length).toBeGreaterThan(0)
  })

  it('숫자 포함 curator id(curator-s028)도 인식', () => {
    const p = resolveAuthorPersonaContext('curator-s028@unao.bot')
    expect(p).not.toBeNull()
    expect(p?.personaId.toLowerCase()).toBe('curator-s028')
    expect(p?.nickname).toBeTruthy()
  })

  it('알 수 없는 bot/curator id는 null (기존처럼 skip)', () => {
    expect(resolveAuthorPersonaContext('bot-zzzz9@unao.bot')).toBeNull()
    expect(resolveAuthorPersonaContext('curator-zzzz9@unao.bot')).toBeNull()
  })

  it('실회원/기타 이메일은 null (개입 금지)', () => {
    expect(resolveAuthorPersonaContext('someone@gmail.com')).toBeNull()
    expect(resolveAuthorPersonaContext('official-unao@unao.bot')).toBeNull()
    expect(resolveAuthorPersonaContext('')).toBeNull()
  })
})

const base: CandidateInput = {
  postSource: 'BOT',
  postBoardType: 'STORY',
  postStatus: 'PUBLISHED',
  commentStatus: 'ACTIVE',
  postAuthorId: 'bot-user-1',
  comment: { parentId: null, authorId: 'real-user-1', guestNickname: null, isBotAuthor: false },
  replies: [],
}

describe('findIneligibleReason — 구조 필터 (필수 원칙 고정)', () => {
  it('적격: BOT 글 + 실회원 최상위 댓글 + 답글 없음', () => {
    expect(findIneligibleReason(base)).toBeNull()
  })
  it('적격: SHEET 글 + 게스트 댓글', () => {
    expect(findIneligibleReason({ ...base, postSource: 'SHEET', comment: { ...base.comment, authorId: null, guestNickname: '나그네' } })).toBeNull()
  })
  it('PUBLISHED가 아닌 글(HIDDEN/DELETED/DRAFT)은 판정 자체 금지', () => {
    expect(findIneligibleReason({ ...base, postStatus: 'HIDDEN' })).toBe('POST_NOT_PUBLISHED')
    expect(findIneligibleReason({ ...base, postStatus: 'DELETED' })).toBe('POST_NOT_PUBLISHED')
    expect(findIneligibleReason({ ...base, postStatus: 'DRAFT' })).toBe('POST_NOT_PUBLISHED')
  })
  it('HIDDEN/DELETED 댓글은 부적격', () => {
    expect(findIneligibleReason({ ...base, commentStatus: 'HIDDEN' })).toBe('COMMENT_NOT_ACTIVE')
    expect(findIneligibleReason({ ...base, commentStatus: 'DELETED' })).toBe('COMMENT_NOT_ACTIVE')
  })
  it('실회원 글(USER)은 절대 개입 금지', () => {
    expect(findIneligibleReason({ ...base, postSource: 'USER' })).toBe('POST_NOT_BOT_SHEET')
  })
  it('MAGAZINE/JOB 게시판 제외', () => {
    expect(findIneligibleReason({ ...base, postBoardType: 'MAGAZINE' })).toBe('BOARD_EXCLUDED')
    expect(findIneligibleReason({ ...base, postBoardType: 'JOB' })).toBe('BOARD_EXCLUDED')
  })
  it('대댓글(parentId 있음)은 대상 아님 — 최상위만', () => {
    expect(findIneligibleReason({ ...base, comment: { ...base.comment, parentId: 'c-parent' } })).toBe('NOT_TOP_LEVEL')
  })
  it('봇이 단 댓글엔 답하지 않음 (기존 체인 영역)', () => {
    expect(findIneligibleReason({ ...base, comment: { ...base.comment, isBotAuthor: true } })).toBe('COMMENT_BY_BOT')
  })
  it('글쓴이 봇이 이미 답함 → 1댓글 1답변 (중복 방지)', () => {
    expect(
      findIneligibleReason({ ...base, replies: [{ authorId: 'bot-user-1', isBotAuthor: true }] }),
    ).toBe('ALREADY_REPLIED_BY_AUTHOR')
  })
  it('실회원이 스레드에서 대화 중이면 개입 금지', () => {
    expect(
      findIneligibleReason({ ...base, replies: [{ authorId: 'real-user-2', isBotAuthor: false }] }),
    ).toBe('REAL_USERS_IN_THREAD')
  })
  it('다른 봇의 답글만 있으면 여전히 적격 (글쓴이 봇 본인 답글만 중복으로 침)', () => {
    expect(
      findIneligibleReason({ ...base, replies: [{ authorId: 'bot-user-2', isBotAuthor: true }] }),
    ).toBeNull()
  })
})

describe('buildAuthorReplyPrompt — 판정 규칙 고정', () => {
  const prompt = buildAuthorReplyPrompt({
    personaNickname: '분당아짐',
    personaPersonality: '따뜻하고 수다스러움',
    personaStyle: '구어체 존댓말',
    personaSpeechPatterns: ['~네요', '어머'],
    postTitle: '갱년기 수면 고민',
    postExcerpt: '요즘 새벽마다 깨요',
    priorComments: ['저도 그래요'],
    targetComment: '혹시 얼굴에 땀이 비오듯 하는데 무슨 증상인지 아시는분요',
    targetAuthorLabel: '회원',
  })
  it('표절·도용 지적은 무조건 ESCALATE 지침 포함', () => {
    expect(prompt).toContain('표절·도용 지적에 절대 답글을 시도하지 마라')
  })
  it('봇 정체·출처 언급 금지 지침 포함', () => {
    expect(prompt).toContain('봇 정체를 절대 언급하지')
  })
  it('페르소나·대상 댓글 주입', () => {
    expect(prompt).toContain('분당아짐')
    expect(prompt).toContain('땀이 비오듯')
  })

  // ── 작성자 연속성 보정(2026-07-20) — 문자열 계약만 검증. 실제 REPLY/SKIP 판정은 LLM이 내므로
  //    vitest로 보장하지 않는다(merge 후 dry-run 1~2회차로 확인). 아래는 프롬프트에 규칙이 실렸는지만 확인.
  it('[작성자 연속성 — 절대 규칙] 블록 포함', () => {
    expect(prompt).toContain('[작성자 연속성 — 절대 규칙]')
    expect(prompt).toContain('상담사·전문가·제3자·일반 회원이 아니라')
    expect(prompt).toContain('새로 지어내지 마라')
  })
  it('[무엇이 REPLY인가] 블록 포함 — 과잉 SKIP 방지 균형추', () => {
    expect(prompt).toContain('[무엇이 REPLY인가]')
    expect(prompt).toContain('대단한 경험담이 없어도 된다')
  })
  it('해결책·서비스 지시 화법 금지(상담사 톤 차단) 규칙 포함', () => {
    expect(prompt).toContain('해결책·서비스·방법을 지시하지 마라')
    expect(prompt).toContain('관찰자 화법 금지')
  })
  it('충돌 제거 증거 — 기존 갱년기 REPLY 강제 예시 문구가 프롬프트에서 사라졌다', () => {
    // 이 문구는 "없는 증상·경험 창작"을 유발해 골든 갱년기 SKIP과 충돌 → 제거 확인
    expect(prompt).not.toContain('같은 고민을 나누러 온 것이므로 글쓴이로서 공감과 경험을 나눠라')
    expect(prompt).not.toContain('주제 이탈로 보지 마라')
  })
  it('SKIP 기준에 "없는 증상·경험 지어내야 하는 경우" 명시', () => {
    expect(prompt).toContain('지어내야만 이을 수 있는 경우')
  })
})

describe('parseAuthorReplyDecision — 파서', () => {
  it('REPLY 정상 파싱', () => {
    const r = parseAuthorReplyDecision('{"verdict":"REPLY","reason":"직접 질문","reply":"어머, 저도 그 증상 있었어요. 병원 한번 가보시는 게 좋아요."}')
    expect(r?.verdict).toBe('REPLY')
    expect(r?.reply).toContain('병원')
  })
  it('SKIP은 reply를 null로 정규화', () => {
    const r = parseAuthorReplyDecision('{"verdict":"SKIP","reason":"짧은 반응","reply":"그래도 뭔가"}')
    expect(r?.verdict).toBe('SKIP')
    expect(r?.reply).toBeNull()
  })
  it('REPLY인데 reply 없음 = 불량 응답 → null (호출부 ESCALATE)', () => {
    expect(parseAuthorReplyDecision('{"verdict":"REPLY","reason":"x","reply":null}')).toBeNull()
  })
  it('verdict enum 밖 → null', () => {
    expect(parseAuthorReplyDecision('{"verdict":"MAYBE","reason":"x","reply":null}')).toBeNull()
  })
  it('JSON 아님 → null', () => {
    expect(parseAuthorReplyDecision('죄송합니다')).toBeNull()
  })
})

describe('resolveAuthorReplyMode — 기본 dry-run, write만 실제 작성', () => {
  it('미설정(undefined) → dry-run (기본값)', () => {
    expect(resolveAuthorReplyMode(undefined)).toBe('dry-run')
  })
  it('빈 문자열 → dry-run', () => {
    expect(resolveAuthorReplyMode('')).toBe('dry-run')
  })
  it("'dry-run' → dry-run", () => {
    expect(resolveAuthorReplyMode('dry-run')).toBe('dry-run')
  })
  it("오타/임의값('WRITE'·'yes' 등) → dry-run (정확히 'write'만 허용)", () => {
    expect(resolveAuthorReplyMode('WRITE')).toBe('dry-run')
    expect(resolveAuthorReplyMode('true')).toBe('dry-run')
    expect(resolveAuthorReplyMode('on')).toBe('dry-run')
  })
  it("'write' → write", () => {
    expect(resolveAuthorReplyMode('write')).toBe('write')
  })
})

describe('shouldWriteReply — REPLY만 작성, SKIP/ESCALATE·dry-run은 절대 write 안 함', () => {
  const verdicts: AuthorReplyVerdict[] = ['REPLY', 'SKIP', 'ESCALATE']

  it('dry-run 모드: 모든 verdict에서 write 안 함 (초안 있어도)', () => {
    for (const v of verdicts) {
      expect(shouldWriteReply('dry-run', v, true)).toBe(false)
      expect(shouldWriteReply('dry-run', v, false)).toBe(false)
    }
  })

  it('write 모드: REPLY + 초안 있음 → write', () => {
    expect(shouldWriteReply('write', 'REPLY', true)).toBe(true)
  })

  it('write 모드: REPLY지만 초안 없음 → write 안 함', () => {
    expect(shouldWriteReply('write', 'REPLY', false)).toBe(false)
  })

  it('write 모드: SKIP·ESCALATE는 초안 유무 무관 write 안 함', () => {
    expect(shouldWriteReply('write', 'SKIP', true)).toBe(false)
    expect(shouldWriteReply('write', 'SKIP', false)).toBe(false)
    expect(shouldWriteReply('write', 'ESCALATE', true)).toBe(false)
    expect(shouldWriteReply('write', 'ESCALATE', false)).toBe(false)
  })

  it('write 모드: REPLY 여러 건이면 각각 true (건수 제한 없음 — DAILY_JUDGE_CAP은 판정 단계에서 제어)', () => {
    expect(shouldWriteReply('write', 'REPLY', true)).toBe(true)
    expect(shouldWriteReply('write', 'REPLY', true)).toBe(true)
    expect(shouldWriteReply('write', 'REPLY', true)).toBe(true)
  })
})
