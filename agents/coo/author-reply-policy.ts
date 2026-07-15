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

[판정 기준]
- REPLY: 나(글쓴이)에게 직접 묻는 질문 / 정성 들인 경험 공유(구체적 내용 2문장 이상) / 진심 어린 공감·축하
  / 내 글 주제와 연관된 본인 증상·고민 질문(예: 갱년기 글에 "저는 얼굴에 땀이 나는데 무슨 증상일까요")
  — 같은 고민을 나누러 온 것이므로 글쓴이로서 공감과 경험을 나눠라. 주제 이탈로 보지 마라
- SKIP: 짧은 반응("ㅋㅋ", "좋아요", "관심을 가져라"류) / 대화 여지 없는 단정 / 비꼼 / 주제 이탈
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
