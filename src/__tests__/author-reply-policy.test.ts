import { describe, it, expect } from 'vitest'
import {
  findIneligibleReason,
  buildAuthorReplyPrompt,
  parseAuthorReplyDecision,
  resolveAuthorReplyMode,
  shouldWriteReply,
  checkWritePreconditions,
  shouldNotifyAuthorReply,
  isRealUserProviderId,
  findMenopauseAuthorReplySafetySkip,
  NON_BOT_COMMENT_AUTHOR_WHERE,
  selectThreadReplyTargets,
  scoreReplyWorthiness,
  MAX_AUTHOR_REPLIES_PER_POST,
  MAX_NEW_REPLIES_PER_POST_PER_RUN,
  type CommentActor,
  type ThreadComment,
  type CandidateInput,
  type AuthorReplyVerdict,
  type WritePreconditionInput,
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
  it('MENOPAUSE(갱년기톡)는 author-reply 대상 보드로 허용', () => {
    expect(findIneligibleReason({ ...base, postBoardType: 'MENOPAUSE' })).toBeNull()
  })
  it('대댓글(parentId 있음)은 대상 아님 — 최상위만', () => {
    expect(findIneligibleReason({ ...base, comment: { ...base.comment, parentId: 'c-parent' } })).toBe('NOT_TOP_LEVEL')
  })
  // [2026-08-06 정책 변경] 예전에는 봇 댓글을 여기서 hard block(COMMENT_BY_BOT)했다.
  //   같은 글에서 사람 댓글에만 답하면 "내 댓글만 감지한다"는 티가 나서(30일 21건 중 13건),
  //   봇 댓글도 구조 필터는 통과시키고 분포는 selectThreadReplyTargets가 통제한다.
  it('봇이 단 댓글도 구조 필터는 통과한다 (분포는 selectThreadReplyTargets가 결정)', () => {
    expect(findIneligibleReason({ ...base, comment: { ...base.comment, isBotAuthor: true } })).toBeNull()
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

  it('MENOPAUSE 보드에서는 의료·성·정신건강 조언 금지 블록을 추가한다', () => {
    const menopausePrompt = buildAuthorReplyPrompt({
      postBoardType: 'MENOPAUSE',
      personaNickname: '분당아짐',
      personaPersonality: '따뜻하고 수다스러움',
      personaStyle: '구어체 존댓말',
      personaSpeechPatterns: ['~네요'],
      postTitle: '갱년기 증상인가요?',
      postExcerpt: '요즘 얼굴이 화끈거려요',
      priorComments: [],
      targetComment: '저도 비슷해서 마음이 힘드네요',
      targetAuthorLabel: '회원',
    })
    expect(menopausePrompt).toContain('[갱년기톡 추가 안전 규칙]')
    expect(menopausePrompt).toContain('병원/검사/약/호르몬제/영양제/치료/진단')
    expect(menopausePrompt).toContain('공감하는 수준')
  })

  it('STORY 보드에는 MENOPAUSE 전용 안전 블록을 넣지 않는다', () => {
    expect(prompt).not.toContain('[갱년기톡 추가 안전 규칙]')
  })
})

describe('findMenopauseAuthorReplySafetySkip — 갱년기톡 write 전 안전 게이트', () => {
  it('MENOPAUSE가 아니면 민감 키워드가 있어도 이 게이트는 관여하지 않는다', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'STORY',
      postTitle: '갱년기 증상',
      targetComment: '호르몬제 먹어도 될까요?',
    })).toBeNull()
  })

  it('단순 공감 댓글은 통과 — 조언이 아니라 짧은 공감 답글 가능', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '자꾸 눈물이 나는 갱년기',
      targetComment: '저도 갱년기인데 슬프고 가슴아프고 정말 힘드네요 같이 잘 이겨내요',
    })).toBeNull()
  })

  it('약·호르몬·병원·검사 등 의료 조언/질문은 SKIP', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '갱년기 오기 전에 어떻게 관리하셨나요?',
      targetComment: '호르몬제 먹어도 될까요? 병원 가야 하나요?',
    })).toBe('MENOPAUSE_MEDICAL_ADVICE_REQUEST')
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '갱년기 넘 힘들어요',
      targetComment: '영양제라도 챙겨드시고 무릎은 병원 상담 받아보세요',
    })).toBe('MENOPAUSE_MEDICAL_ADVICE_REQUEST')
  })

  it('성적 내용은 SKIP', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '폐경 즘이면 성욕이 아예 사라지나요?',
      targetComment: '저도 궁금해요',
    })).toBe('MENOPAUSE_SEXUAL_CONTENT')
  })

  it('위기성 정신건강 표현은 SKIP', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '갱년기 증상인가요?',
      targetComment: '요즘 정말 죽고 싶다는 생각까지 들어요',
    })).toBe('MENOPAUSE_MENTAL_HEALTH_CRISIS')
  })

  it('잠·피로 같은 약신호 단독 공감은 의료 조언이 없으면 통과', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '요즘 왜 이렇게 졸릴까요? 갱년기 증상일까요?',
      targetComment: '저도 오후만 되면 눈이 감겨서 힘드네요',
    })).toBeNull()
  })

  it('금융치료 같은 관용 표현은 의료 조언으로 오탐하지 않는다', () => {
    expect(findMenopauseAuthorReplySafetySkip({
      postBoardType: 'MENOPAUSE',
      postTitle: '자꾸 눈물이 나는 갱년기',
      targetComment: '허무함을 잔돈푼으로 금융치료를 하고 살아요',
    })).toBeNull()
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

describe('checkWritePreconditions — write 직전 parent+post 재검증', () => {
  const base: WritePreconditionInput = {
    targetPostId: 'post1',
    parent: { status: 'ACTIVE', parentId: null, postId: 'post1' },
    post: { status: 'PUBLISHED', source: 'SHEET', boardType: 'STORY', authorId: 'author1' },
    authorAlreadyReplied: false,
  }

  it('모든 조건 통과 → ok', () => {
    expect(checkWritePreconditions(base)).toEqual({ ok: true, reason: null })
  })

  it('parent 미존재 → PARENT_NOT_FOUND', () => {
    expect(checkWritePreconditions({ ...base, parent: null }).reason).toBe('PARENT_NOT_FOUND')
  })

  it('parent 숨김(status HIDDEN) → PARENT_NOT_ACTIVE (write 안 함)', () => {
    const r = checkWritePreconditions({ ...base, parent: { status: 'HIDDEN', parentId: null, postId: 'post1' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('PARENT_NOT_ACTIVE')
  })

  it('parent가 대댓글(parentId != null) → PARENT_NOT_TOP_LEVEL (write 안 함)', () => {
    const r = checkWritePreconditions({ ...base, parent: { status: 'ACTIVE', parentId: 'someParent', postId: 'post1' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('PARENT_NOT_TOP_LEVEL')
  })

  it('parent.postId가 대상 postId와 불일치 → PARENT_POST_MISMATCH', () => {
    const r = checkWritePreconditions({ ...base, parent: { status: 'ACTIVE', parentId: null, postId: 'otherPost' } })
    expect(r.reason).toBe('PARENT_POST_MISMATCH')
  })

  it('post 미존재 → POST_NOT_FOUND', () => {
    expect(checkWritePreconditions({ ...base, post: null }).reason).toBe('POST_NOT_FOUND')
  })

  it('post 숨김(status HIDDEN) → POST_NOT_PUBLISHED (write 안 함)', () => {
    const r = checkWritePreconditions({ ...base, post: { status: 'HIDDEN', source: 'SHEET', boardType: 'STORY', authorId: 'author1' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('POST_NOT_PUBLISHED')
  })

  it('post source가 USER(실회원 글) → POST_NOT_BOT_SHEET', () => {
    const r = checkWritePreconditions({ ...base, post: { status: 'PUBLISHED', source: 'USER', boardType: 'STORY', authorId: 'author1' } })
    expect(r.reason).toBe('POST_NOT_BOT_SHEET')
  })

  it('post boardType이 MAGAZINE → BOARD_EXCLUDED', () => {
    const r = checkWritePreconditions({ ...base, post: { status: 'PUBLISHED', source: 'SHEET', boardType: 'MAGAZINE', authorId: 'author1' } })
    expect(r.reason).toBe('BOARD_EXCLUDED')
  })

  it('post authorId 없음 → NO_POST_AUTHOR', () => {
    const r = checkWritePreconditions({ ...base, post: { status: 'PUBLISHED', source: 'SHEET', boardType: 'STORY', authorId: null } })
    expect(r.reason).toBe('NO_POST_AUTHOR')
  })

  it('이미 작성자 봇이 답글 있음 → ALREADY_REPLIED_BY_AUTHOR', () => {
    const r = checkWritePreconditions({ ...base, authorAlreadyReplied: true })
    expect(r.reason).toBe('ALREADY_REPLIED_BY_AUTHOR')
  })

  it('BOT source + LIFE2/HUMOR/MENOPAUSE board도 통과', () => {
    expect(checkWritePreconditions({ ...base, post: { status: 'PUBLISHED', source: 'BOT', boardType: 'LIFE2', authorId: 'a' } }).ok).toBe(true)
    expect(checkWritePreconditions({ ...base, post: { status: 'PUBLISHED', source: 'BOT', boardType: 'HUMOR', authorId: 'a' } }).ok).toBe(true)
    expect(checkWritePreconditions({ ...base, post: { status: 'PUBLISHED', source: 'BOT', boardType: 'MENOPAUSE', authorId: 'a' } }).ok).toBe(true)
  })
})

describe('isRealUserProviderId — 카카오 실회원(숫자 providerId)만', () => {
  it('숫자 문자열 → true', () => {
    expect(isRealUserProviderId('123456789')).toBe(true)
  })
  it('null/빈값/비숫자(봇·게스트) → false', () => {
    expect(isRealUserProviderId(null)).toBe(false)
    expect(isRealUserProviderId(undefined)).toBe(false)
    expect(isRealUserProviderId('')).toBe(false)
    expect(isRealUserProviderId('bot-abc')).toBe(false)
    expect(isRealUserProviderId('123a')).toBe(false)
  })
})

describe('shouldNotifyAuthorReply — 종모양 알림 생성 게이트', () => {
  const realUser = { id: 'u1', providerId: '99887766', status: 'ACTIVE' }

  it('실회원·ACTIVE·자기아님 → ok', () => {
    expect(shouldNotifyAuthorReply(realUser, 'bot1')).toEqual({ ok: true, reason: null })
  })

  it('수신자 없음(게스트: recipient null 또는 id null) → NO_RECIPIENT', () => {
    expect(shouldNotifyAuthorReply(null, 'bot1').reason).toBe('NO_RECIPIENT')
    expect(shouldNotifyAuthorReply({ id: null, providerId: '123', status: 'ACTIVE' }, 'bot1').reason).toBe('NO_RECIPIENT')
  })

  it('비활성(탈퇴/정지) → RECIPIENT_INACTIVE', () => {
    expect(shouldNotifyAuthorReply({ ...realUser, status: 'BANNED' }, 'bot1').reason).toBe('RECIPIENT_INACTIVE')
    expect(shouldNotifyAuthorReply({ ...realUser, status: 'WITHDRAWN' }, 'bot1').reason).toBe('RECIPIENT_INACTIVE')
  })

  it('봇/게스트(providerId 비숫자·null) → RECIPIENT_NOT_REAL_USER', () => {
    expect(shouldNotifyAuthorReply({ ...realUser, providerId: null }, 'bot1').reason).toBe('RECIPIENT_NOT_REAL_USER')
    expect(shouldNotifyAuthorReply({ ...realUser, providerId: 'bot-k' }, 'bot1').reason).toBe('RECIPIENT_NOT_REAL_USER')
  })

  it('수신자 == 답글 작성자 → SELF_NOTIFY', () => {
    expect(shouldNotifyAuthorReply({ ...realUser, id: 'same' }, 'same').reason).toBe('SELF_NOTIFY')
  })
})

// ── 댓글판 흐름 기반 대상 선정 (2026-08-06 PR-2) ─────────────────────────────
// 목적: "실유저 댓글만 감지해 답한다"는 티를 없앤다. 답글 수를 늘리는 게 아니라 분포를 바꾼다.
describe('selectThreadReplyTargets — 댓글판 흐름', () => {
  const c = (
    id: string,
    actor: CommentActor,
    content = '오늘 하루도 참 길었네요 다들 어떻게 지내시나요',
    over: Partial<ThreadComment> = {},
  ): ThreadComment => ({ id, actor, content, hasAuthorReply: false, hasRealUserReply: false, ...over })

  it('1. 실회원 댓글은 여전히 후보다', () => {
    const t = selectThreadReplyTargets({ postId: 'p1', topLevel: [c('c1', 'REAL_MEMBER')] })
    expect(t.map(x => x.commentId)).toContain('c1')
    expect(t.find(x => x.commentId === 'c1')!.role).toBe('PRIMARY')
  })

  it('2. 게스트 댓글도 후보가 된다', () => {
    const t = selectThreadReplyTargets({ postId: 'p1', topLevel: [c('g1', 'GUEST')] })
    expect(t.map(x => x.commentId)).toContain('g1')
  })

  it('3. 봇 댓글도 후보가 된다 — 단 사람 댓글을 다 답한 다음 회차에 (COMPANION)', () => {
    // 사람 댓글이 아직 열려 있으면 그쪽이 먼저다(총량을 늘리지 않기 위해).
    const tops = [...Array(4)].map((_, i) => c(`b${i}`, 'BOT')).concat(c('r1', 'REAL_MEMBER'))
    const round1 = selectThreadReplyTargets({ postId: 'p1', topLevel: tops })
    expect(round1.every(x => x.role === 'PRIMARY')).toBe(true)
    expect(round1.map(x => x.commentId)).toContain('r1')

    // 사람 댓글에 답한 뒤 회차 → 이번엔 봇 댓글이 후보가 된다
    const after = tops.map(x => (x.id === 'r1' ? { ...x, hasAuthorReply: true } : x))
    const round2 = selectThreadReplyTargets({ postId: 'p1', topLevel: after })
    expect(round2.some(x => x.role === 'COMPANION' && x.commentId.startsWith('b'))).toBe(true)
  })

  it('9. 사람 댓글 하나에만 답글이 붙는 패턴이 사라진다 (봇 있는 글)', () => {
    // 실측 패턴 재현: 최상위 8개 중 봇 7 + 사람 1 → 예전에는 사람 1개만 영원히 답글 대상
    let tops = [...Array(7)].map((_, i) => c(`b${i}`, 'BOT')).concat(c('r1', 'REAL_MEMBER'))
    const roles = new Set<string>()
    for (let round = 0; round < 4; round++) {
      const picked = selectThreadReplyTargets({ postId: 'p1', topLevel: tops })
      if (picked.length === 0) break
      for (const p of picked) {
        roles.add(p.role)
        tops = tops.map(x => (x.id === p.commentId ? { ...x, hasAuthorReply: true } : x))
      }
    }
    expect(roles.has('PRIMARY')).toBe(true)
    expect(roles.has('COMPANION')).toBe(true) // ← 결국 봇 댓글에도 답해 패턴을 지운다
  })

  it('총량 억제: 사람 댓글이 열려 있는 회차에는 봇 댓글을 같이 고르지 않는다', () => {
    const tops = [...Array(6)].map((_, i) => c(`b${i}`, 'BOT')).concat(c('r1', 'REAL_MEMBER'))
    const picked = selectThreadReplyTargets({ postId: 'p1', topLevel: tops })
    expect(picked.some(x => x.role === 'COMPANION')).toBe(false)
  })

  it('한산한 글(봇 댓글 적음)에는 COMPANION을 억지로 붙이지 않는다', () => {
    // 봇 2개뿐 — COMPANION_MIN_BOT_COMMENTS(3) 미만
    const tops = [c('b0', 'BOT'), c('b1', 'BOT'), c('r1', 'REAL_MEMBER', '질문', { hasAuthorReply: true })]
    expect(selectThreadReplyTargets({ postId: 'p1', topLevel: tops })).toEqual([])
  })

  it('사람 댓글이 없으면 아무 것도 고르지 않는다 (봇끼리 연극 금지)', () => {
    const t = selectThreadReplyTargets({ postId: 'p1', topLevel: [c('b1', 'BOT'), c('b2', 'BOT')] })
    expect(t).toEqual([])
  })

  it('6. 이미 글쓴이가 답한 댓글은 다시 고르지 않는다', () => {
    const t = selectThreadReplyTargets({
      postId: 'p1',
      topLevel: [c('r1', 'REAL_MEMBER', '질문 있어요 어떻게 하나요?', { hasAuthorReply: true })],
    })
    expect(t.map(x => x.commentId)).not.toContain('r1')
  })

  it('7. 실회원이 대화 중인 스레드에는 개입하지 않는다', () => {
    const t = selectThreadReplyTargets({
      postId: 'p1',
      topLevel: [c('r1', 'REAL_MEMBER', '어떻게 하셨어요?', { hasRealUserReply: true })],
    })
    expect(t.map(x => x.commentId)).not.toContain('r1')
  })

  it('봇 댓글에 이미 글쓴이가 답했으면 COMPANION을 더 붙이지 않는다', () => {
    const t = selectThreadReplyTargets({
      postId: 'p1',
      topLevel: [c('b1', 'BOT', '봇 댓글', { hasAuthorReply: true }), c('r1', 'REAL_MEMBER')],
    })
    expect(t.some(x => x.role === 'COMPANION')).toBe(false)
  })

  it('10. 글당 답글 총량에 cap이 있다 (기존 답글 포함)', () => {
    const many = [...Array(10)].map((_, i) => c(`r${i}`, 'REAL_MEMBER'))
    const t = selectThreadReplyTargets({ postId: 'p1', topLevel: many })
    expect(t.length).toBeLessThanOrEqual(MAX_NEW_REPLIES_PER_POST_PER_RUN + 1)
    expect(t.length).toBeLessThanOrEqual(MAX_AUTHOR_REPLIES_PER_POST)
  })

  it('이미 답글이 cap만큼 있으면 더 고르지 않는다', () => {
    const tops = [...Array(MAX_AUTHOR_REPLIES_PER_POST)].map((_, i) =>
      c(`x${i}`, 'BOT', '봇', { hasAuthorReply: true }),
    ).concat(c('r1', 'REAL_MEMBER'))
    expect(selectThreadReplyTargets({ postId: 'p1', topLevel: tops })).toEqual([])
  })

  it('질문/경험 공유가 짧은 감탄보다 먼저 선택된다', () => {
    const t = selectThreadReplyTargets({
      postId: 'p1',
      topLevel: [c('short', 'REAL_MEMBER', 'ㅋㅋㅋ'), c('q', 'REAL_MEMBER', '이럴 땐 어떻게 하셨나요?')],
    })
    expect(t[0].commentId).toBe('q')
  })

  it('scoreReplyWorthiness — 질문 > 경험 > 짧은 감탄', () => {
    expect(scoreReplyWorthiness('이럴 땐 어떻게 하셨나요?')).toBeGreaterThan(
      scoreReplyWorthiness('저도 작년에 비슷한 일이 있어서 한참 고민했었어요'),
    )
    expect(scoreReplyWorthiness('저도 작년에 비슷한 일이 있어서 한참 고민했었어요')).toBeGreaterThan(
      scoreReplyWorthiness('ㅋㅋㅋ'),
    )
  })

  it('4·8. 알림/민감주제 게이트는 이 함수가 건드리지 않는다 (기존 게이트 유지)', () => {
    // 봇 대상 답글에 알림이 가지 않는 것은 shouldNotifyAuthorReply가 보장한다
    expect(shouldNotifyAuthorReply({ id: 'bot-1', providerId: 'bot-abc', status: 'ACTIVE' }, 'author-1').ok).toBe(false)
    // MENOPAUSE 의료 조언성은 여전히 SKIP
    expect(
      findMenopauseAuthorReplySafetySkip({
        postBoardType: 'MENOPAUSE',
        postTitle: '갱년기 증상',
        targetComment: '호르몬 치료 받아야 할까요? 약 먹어도 되나요?',
      }),
    ).not.toBeNull()
  })
})
