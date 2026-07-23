/**
 * 작성자 봇 대댓글 — 순수부 (판정 타입·구조 필터·프롬프트 빌더·파서). DB/SDK 의존 없음.
 * 런타임(후보 조회·Sonnet 호출·BotLog)은 author-reply-driver.ts 참조.
 *
 * 원칙 (2026-07-15 설계, 14일 실측 13건 기반):
 *  - BOT/SHEET 글의 최상위(parentId=null) 실회원·게스트 댓글만 후보
 *  - 실회원 글(source USER)·MAGAZINE/JOB·실회원끼리 대화 중 스레드·이중 답변 금지
 *  - 글쓴이 봇 페르소나만 답한다. dry-run에서는 초안만 기록(Comment write 금지)
 */

export type AuthorReplyVerdict = 'REPLY' | 'SKIP' | 'ESCALATE'

export interface AuthorReplyDecision {
  verdict: AuthorReplyVerdict
  reason: string
  reply: string | null
}

const VERDICTS: readonly AuthorReplyVerdict[] = ['REPLY', 'SKIP', 'ESCALATE']

// ── 구조 필터 (순수 — 테스트 대상) ─────────────────────────────

export interface CandidateInput {
  postSource: string
  postBoardType: string
  /** 숨김/삭제/DRAFT 글 판정 금지 — PUBLISHED만 (DB 조회 필터와 이중 방어) */
  postStatus: string
  /** 숨김/삭제 댓글 판정 금지 — ACTIVE만 (이중 방어) */
  commentStatus: string
  /** 글쓴이 봇 User id */
  postAuthorId: string | null
  comment: {
    parentId: string | null
    /** 회원 댓글이면 User id, 게스트면 null */
    authorId: string | null
    guestNickname: string | null
    /** authorId가 봇 계정(@unao.bot)인지 — 호출부가 email로 판별해 전달 */
    isBotAuthor: boolean
  }
  /** 이 댓글에 달린 답글들 */
  replies: Array<{ authorId: string | null; isBotAuthor: boolean }>
}

const ELIGIBLE_SOURCES = new Set(['BOT', 'SHEET'])
const ELIGIBLE_BOARDS = new Set(['STORY', 'LIFE2', 'HUMOR']) // MAGAZINE/JOB 제외

/**
 * 후보 조회(DB where)에서 봇 작성 댓글을 먼저 제외하는 조건 — 상류 잘림 hotfix (2026-07-15).
 * 배경: 48h 최상위 댓글 1,696건 중 대부분이 봇 wave 댓글이라 take 200(createdAt asc)이
 * 봇 댓글로만 소진되어, 비봇 댓글 6건 전원이 구조 필터에 도달하기 전에 잘렸다(첫 회차 판정 0건).
 * 이 조건은 take 상한을 사람 댓글 후보로 채우기 위한 것이고,
 * 최종 안전망은 여전히 findIneligibleReason의 COMMENT_BY_BOT이다(이중 방어).
 * 글(post) 작성자 조건은 걸지 않는다 — curator-* 작성글의 실회원 댓글도 후보에 남아야 한다.
 */
export const NON_BOT_COMMENT_AUTHOR_WHERE = {
  OR: [
    // 게스트 댓글: 회원 없음 + 게스트 닉 존재
    { authorId: null, guestNickname: { not: null } },
    // 실회원 댓글: 이메일이 봇 도메인(@unao.bot)이 아님
    { author: { is: { email: { not: { endsWith: '@unao.bot' } } } } },
    // 실회원 댓글: 이메일 자체가 없는 계정 (not endsWith는 null을 매칭하지 않으므로 별도 브랜치)
    { author: { is: { email: null } } },
  ],
} as const

/** 후보 자격 판정 — 부적격 사유 문자열 반환, 적격이면 null */
export function findIneligibleReason(c: CandidateInput): string | null {
  if (c.postStatus !== 'PUBLISHED') return 'POST_NOT_PUBLISHED' // 숨김/삭제/DRAFT 글 — 판정·Slack 알림 자체 금지
  if (c.commentStatus !== 'ACTIVE') return 'COMMENT_NOT_ACTIVE' // 숨김/삭제 댓글 동일
  if (!ELIGIBLE_SOURCES.has(c.postSource)) return 'POST_NOT_BOT_SHEET' // 실회원 글 개입 금지
  if (!ELIGIBLE_BOARDS.has(c.postBoardType)) return 'BOARD_EXCLUDED'
  if (!c.postAuthorId) return 'NO_POST_AUTHOR'
  if (c.comment.parentId !== null) return 'NOT_TOP_LEVEL'
  if (c.comment.isBotAuthor) return 'COMMENT_BY_BOT' // 봇 댓글엔 답하지 않음(기존 체인 영역)
  if (!c.comment.authorId && !c.comment.guestNickname) return 'NO_COMMENT_AUTHOR'

  // 글쓴이 봇이 이미 답함 → 1댓글 1답변 원칙
  if (c.replies.some(r => r.authorId === c.postAuthorId)) return 'ALREADY_REPLIED_BY_AUTHOR'
  // 실회원(비봇)이 이미 답글로 대화 중 → 개입 금지
  if (c.replies.some(r => !r.isBotAuthor)) return 'REAL_USERS_IN_THREAD'

  return null
}

// ── Sonnet 프롬프트 (판단+초안 1콜) ─────────────────────────────

export interface AuthorReplyPromptInput {
  personaNickname: string
  personaPersonality: string
  personaStyle: string
  personaSpeechPatterns: string[]
  postTitle: string
  postExcerpt: string
  priorComments: string[]
  targetComment: string
  targetAuthorLabel: string // "회원" | "게스트 ○○"
}

export function buildAuthorReplyPrompt(i: AuthorReplyPromptInput): string {
  return `당신은 '우나어'(40대 중반~60대 한국 여성 커뮤니티)의 회원 ${i.personaNickname}이다.
성격: ${i.personaPersonality}
말투: ${i.personaStyle} / 자주 쓰는 표현: ${i.personaSpeechPatterns.slice(0, 3).join(', ')}

당신이 쓴 아래 글에 ${i.targetAuthorLabel}이 댓글을 남겼다.
먼저 답할 가치를 판정하고, REPLY일 때만 글쓴이로서 답글을 작성하라.

[작성자 연속성 — 절대 규칙]
1. 나는 이 글을 쓴 당사자다. 상담사·전문가·제3자·일반 회원이 아니라 '내 글에 달린 댓글에 답하는 글쓴이'로만 말한다.
2. [내 글] 본문에 적힌 내 상황·가족관계·감정 안에서만 답한다. 원글에 없는 가족(자녀·손주 등), 과거 경험, 병원 경험, 직업을 새로 지어내지 마라.
3. "저도 예전에/제 경험으로는/저도 비슷한 시기에" 류는 그 경험이 [내 글] 본문에 실제로 있을 때만 쓴다.
4. 댓글 작성자에게 해결책·서비스·방법을 지시하지 마라("~해보세요/~들여보세요/~가보세요" 금지). 내 글의 상황·감정을 이어서 반응하라.
5. "주변에 ~한 사람 많더라" 관찰자 화법 금지. 항상 '나(글쓴이)' 1인칭으로.
6. 다른 카페·원문 출처·봇 정체를 절대 언급하지 마라.

[무엇이 REPLY인가]
- 대단한 경험담이 없어도 된다. [내 글]에 이미 드러난 내 감정·고민·계획·궁금증을 잇는 '나도 그렇다'류 반응이면 REPLY다.
  (걱정글→"저도 그게 걱정돼서 ~하려고요" / 궁금글→"저도 궁금해서 올렸어요, 같이 궁금하네요" / 푸념글→"그러게요 저도 ~")
- SKIP은 오직: 짧은 반응·단정·비꼼·완전한 주제이탈이거나, [내 글]에 없는 증상·경험을 지어내지 않고는 한 마디도 이을 수 없을 때만.

[판정 기준]
- REPLY: 나(글쓴이)에게 직접 묻는 질문 / 정성 들인 경험 공유(구체적 내용 2문장 이상) / 진심 어린 공감·축하
  / [내 글]에 이미 있는 내 감정·고민·계획을 잇는 '나도 그렇다'류 반응
- SKIP: 짧은 반응("ㅋㅋ", "좋아요", "관심을 가져라"류) / 대화 여지 없는 단정 / 비꼼 / 주제 이탈
  / 불특정 다수에게 던진 질문이라 [내 글]에 없는 증상·경험을 지어내야만 이을 수 있는 경우
- ESCALATE(사람 검토): 표절·도용 지적("본인 글 아니지 않냐"류) / 공격·시비 / 정치 / 성적 내용 /
  법률 분쟁 / 위험한 의료 상담(약물·진단 요구) / 판정이 불확실한 모든 경우
표절·도용 지적에 절대 답글을 시도하지 마라 — 무조건 ESCALATE다.

[답글 작성 규칙 — REPLY일 때만]
- 1~2문장, 위 말투 유지. 댓글 내용의 구체적 지점에 반응하라(형식적 "감사합니다" 금지)
- 의료·법률 조언 금지("병원 한번 가보시는 게" 수준까지만)
- 다른 카페·원문 출처·봇 정체를 절대 언급하지 마라
- 이모지·과장 절제, 40~60대 여성의 자연스러운 존댓말

[내 글]
제목: ${i.postTitle}
본문 요약: ${i.postExcerpt}
[이 글의 다른 댓글 맥락]
${i.priorComments.slice(0, 3).map(c => `- ${c}`).join('\n') || '- (없음)'}
[답할지 판정할 대상 댓글]
"${i.targetComment}"

아래 JSON만 출력하라. 다른 텍스트 금지.
{"verdict":"REPLY|SKIP|ESCALATE","reason":"판정 근거 한 문장","reply":"REPLY일 때만 답글, 아니면 null"}`
}

// ── write 모드 게이트 (순수 — 테스트 대상) ─────────────────────────────

export type AuthorReplyMode = 'dry-run' | 'write'

/** env(AUTHOR_REPLY_MODE) → 모드. 'write'만 실제 작성, 그 외/미설정은 dry-run(기본값). */
export function resolveAuthorReplyMode(envValue: string | undefined): AuthorReplyMode {
  return envValue === 'write' ? 'write' : 'dry-run'
}

/**
 * 실제 Comment write 여부 — write 모드 + verdict === 'REPLY' + 초안 존재일 때만 true.
 * dry-run / SKIP / ESCALATE / 초안 없음은 반드시 false (실제 작성 금지).
 */
export function shouldWriteReply(mode: AuthorReplyMode, verdict: AuthorReplyVerdict, hasReplyDraft: boolean): boolean {
  return mode === 'write' && verdict === 'REPLY' && hasReplyDraft
}

// ── write 직전 사전조건 재검증 (순수 — 테스트 대상) ─────────────────────────────
// 후보 조회~판정 사이 시간차로 글/댓글이 숨김·삭제·이동될 수 있어, 실제 write 직전 DB 재조회 스냅샷으로 재검증.
// 실패 시 Comment.create 금지 + AUTHOR_REPLY_WRITE 로그에 outcome/reason 기록.

export type WritePreconditionReason =
  | 'PARENT_NOT_FOUND'
  | 'PARENT_NOT_ACTIVE'
  | 'PARENT_NOT_TOP_LEVEL'
  | 'PARENT_POST_MISMATCH'
  | 'POST_NOT_FOUND'
  | 'POST_NOT_PUBLISHED'
  | 'POST_NOT_BOT_SHEET'
  | 'BOARD_EXCLUDED'
  | 'NO_POST_AUTHOR'
  | 'ALREADY_REPLIED_BY_AUTHOR'

export interface WritePreconditionInput {
  /** driver가 write하려는 대상 postId (parent.postId와 일치해야 함) */
  targetPostId: string
  /** write 직전 재조회한 parent(대상 유저 댓글) 스냅샷. 미존재 시 null */
  parent: { status: string; parentId: string | null; postId: string } | null
  /** write 직전 재조회한 post 스냅샷. 미존재 시 null */
  post: { status: string; source: string; boardType: string; authorId: string | null } | null
  /** 같은 parentId에 post.authorId가 이미 ACTIVE 답글을 달았는지 (재조회 결과) */
  authorAlreadyReplied: boolean
}

/** write 직전 재검증 — 통과 시 {ok:true}, 실패 시 {ok:false, reason}. 후보 조회 필터와 동일 기준(ELIGIBLE_*) 재적용. */
export function checkWritePreconditions(i: WritePreconditionInput): { ok: boolean; reason: WritePreconditionReason | null } {
  if (!i.parent) return { ok: false, reason: 'PARENT_NOT_FOUND' }
  if (i.parent.status !== 'ACTIVE') return { ok: false, reason: 'PARENT_NOT_ACTIVE' } // 숨김/삭제 댓글에 답 금지
  if (i.parent.parentId !== null) return { ok: false, reason: 'PARENT_NOT_TOP_LEVEL' } // 대댓글엔 답 금지
  if (i.parent.postId !== i.targetPostId) return { ok: false, reason: 'PARENT_POST_MISMATCH' }
  if (!i.post) return { ok: false, reason: 'POST_NOT_FOUND' }
  if (i.post.status !== 'PUBLISHED') return { ok: false, reason: 'POST_NOT_PUBLISHED' } // 숨김/삭제 글에 답 금지
  if (!ELIGIBLE_SOURCES.has(i.post.source)) return { ok: false, reason: 'POST_NOT_BOT_SHEET' } // 실회원 글 개입 금지
  if (!ELIGIBLE_BOARDS.has(i.post.boardType)) return { ok: false, reason: 'BOARD_EXCLUDED' } // MAGAZINE/JOB 제외
  if (!i.post.authorId) return { ok: false, reason: 'NO_POST_AUTHOR' }
  if (i.authorAlreadyReplied) return { ok: false, reason: 'ALREADY_REPLIED_BY_AUTHOR' } // 1댓글 1답변
  return { ok: true, reason: null }
}

// ── 종모양 알림 생성 게이트 (순수 — 테스트 대상) ─────────────────────────────
// write REPLY 성공 후 원댓글 작성자에게 "답글 달렸어요" Notification을 생성할지 판정.
// 실회원(providerId 숫자) + ACTIVE + 게스트 아님 + 자기 자신 아님일 때만. (src notifyUser의 isRealUser와 동일 규칙 복제)

export type AuthorReplyNotifySkipReason =
  | 'NO_RECIPIENT'          // authorId 없음(게스트 댓글)
  | 'RECIPIENT_INACTIVE'    // 탈퇴/정지
  | 'RECIPIENT_NOT_REAL_USER' // 봇/게스트(providerId 비숫자 또는 null)
  | 'SELF_NOTIFY'           // 수신자 == 답글 작성자(자기 알림 금지)

/** providerId가 숫자(카카오 실회원)인지 — src/lib/notify.ts isRealUser와 동일 규칙. agents→src import 금지로 복제. */
export function isRealUserProviderId(providerId: string | null | undefined): boolean {
  return !!providerId && /^\d+$/.test(providerId)
}

export function shouldNotifyAuthorReply(
  recipient: { id: string | null; providerId: string | null; status: string } | null,
  fromUserId: string,
): { ok: boolean; reason: AuthorReplyNotifySkipReason | null } {
  if (!recipient || !recipient.id) return { ok: false, reason: 'NO_RECIPIENT' }
  if (recipient.status !== 'ACTIVE') return { ok: false, reason: 'RECIPIENT_INACTIVE' }
  if (!isRealUserProviderId(recipient.providerId)) return { ok: false, reason: 'RECIPIENT_NOT_REAL_USER' }
  if (recipient.id === fromUserId) return { ok: false, reason: 'SELF_NOTIFY' }
  return { ok: true, reason: null }
}

/** 응답 파싱 — 실패 시 null (호출부가 ESCALATE 처리) */
export function parseAuthorReplyDecision(response: string): AuthorReplyDecision | null {
  const m = response.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: unknown
  try {
    raw = JSON.parse(m[0])
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const verdict = VERDICTS.find(v => v === r.verdict)
  if (!verdict) return null
  const reply = typeof r.reply === 'string' && r.reply.trim() && r.reply !== 'null' ? r.reply.trim().slice(0, 500) : null
  if (verdict === 'REPLY' && !reply) return null // REPLY인데 답글 없음 = 불량 응답
  return {
    verdict,
    reason: typeof r.reason === 'string' ? r.reason.slice(0, 200) : '',
    reply: verdict === 'REPLY' ? reply : null,
  }
}
