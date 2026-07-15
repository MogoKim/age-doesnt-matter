import { describe, it, expect } from 'vitest'
import {
  findIneligibleReason,
  buildAuthorReplyPrompt,
  parseAuthorReplyDecision,
  type CandidateInput,
} from '../../agents/coo/author-reply-policy'

/** 작성자 봇 대댓글 dry-run — 구조 필터·프롬프트·파서 고정 */

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
