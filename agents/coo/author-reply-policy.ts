/**
 * 작성자 봇 대댓글 — 순수부 (판정 타입·구조 필터·프롬프트 빌더·파서). DB/SDK 의존 없음.
 * 런타임(후보 조회·Sonnet 호출·BotLog)은 author-reply-driver.ts 참조.
 *
 * 원칙 (2026-08-06 개정 — 댓글판 흐름 기반):
 *  - BOT/SHEET 글의 최상위(parentId=null) 댓글을 **글 단위 댓글판**으로 본다.
 *  - 실회원·게스트 댓글이 핵심 후보인 것은 그대로다(리텐션 목적).
 *    다만 **봇 댓글도 후보가 될 수 있다** — 같은 글에서 사람 댓글에만 답하면
 *    "내 댓글만 감지해서 답한다"는 티가 나기 때문이다(30일 실측: 21건 중 13건이 그 패턴).
 *  - 대상 선정은 selectThreadReplyTargets()가 글 단위로 결정한다. 답글 총량은 글당 cap으로 묶는다.
 *  - 실회원 글(source USER)·MAGAZINE/JOB·실회원끼리 대화 중 스레드·이중 답변 금지는 유지.
 *  - 글쓴이 봇 페르소나만 답한다. dry-run에서는 초안만 기록(Comment write 금지)
 *  - 알림은 실회원 수신자에게만 간다(shouldNotifyAuthorReply) — 봇/게스트 대상 답글은 알림 없음.
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
const ELIGIBLE_BOARDS = new Set(['STORY', 'LIFE2', 'HUMOR', 'MENOPAUSE']) // MAGAZINE/JOB/WEEKLY 제외

/**
 * 후보 조회(DB where)에서 봇 작성 댓글을 먼저 제외하는 조건 — 상류 잘림 hotfix (2026-07-15).
 * 배경: 48h 최상위 댓글 1,696건 중 대부분이 봇 wave 댓글이라 take 200(createdAt asc)이
 * 봇 댓글로만 소진되어, 비봇 댓글 6건 전원이 구조 필터에 도달하기 전에 잘렸다(첫 회차 판정 0건).
 *
 * [2026-08-06] 이 조건의 역할이 바뀌었다. 이제 "봇 댓글을 영구 배제"하는 필터가 아니라
 * **댓글판을 열어볼 글을 찾는 1단계 조회**다. 봇 댓글도 후보가 될 수 있고
 * (selectThreadReplyTargets가 결정), 스캔 대상만 사람이 참여한 글로 한정해
 * 판정량 폭증을 막는다(실측 48h: 사람 최상위 5건 vs 봇 포함 1,947건 = 389배).
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
  // [2026-08-06] 봇 댓글 hard block(COMMENT_BY_BOT)을 제거했다.
  //   같은 글에서 사람 댓글에만 답하면 "내 댓글만 감지한다"는 티가 난다(30일 21건 중 13건).
  //   봇 댓글도 후보가 될 수 있고, 분포는 selectThreadReplyTargets가 글 단위로 통제한다.
  //   봇 댓글엔 알림이 가지 않는다(shouldNotifyAuthorReply가 실회원만 통과).
  if (!c.comment.authorId && !c.comment.guestNickname) return 'NO_COMMENT_AUTHOR'

  // 글쓴이 봇이 이미 답함 → 1댓글 1답변 원칙
  if (c.replies.some(r => r.authorId === c.postAuthorId)) return 'ALREADY_REPLIED_BY_AUTHOR'
  // 실회원(비봇)이 이미 답글로 대화 중 → 개입 금지
  if (c.replies.some(r => !r.isBotAuthor)) return 'REAL_USERS_IN_THREAD'

  return null
}

// ── 댓글판 흐름 기반 대상 선정 (순수 — 테스트 대상) ─────────────────────────
// 목적: "실유저 댓글만 감지해 답한다"는 티를 없앤다.
// 방법: 글 단위로 댓글판을 보고, 사람 댓글에 답할 때 같은 글의 봇 댓글에도 함께 답한다.
//   답글 수를 늘리는 게 아니라 **분포**를 바꾸는 것이다 — 글당 총량은 cap으로 묶는다.

export type CommentActor = 'REAL_MEMBER' | 'GUEST' | 'BOT' | 'NON_REAL'

export interface ThreadComment {
  id: string
  actor: CommentActor
  content: string
  /** 글쓴이 봇이 이미 이 댓글에 답했는가 */
  hasAuthorReply: boolean
  /** 실회원(비봇)이 이 스레드에서 대화 중인가 — 개입 금지 신호 */
  hasRealUserReply: boolean
}

export interface ThreadState {
  postId: string
  /** 최상위(parentId=null) ACTIVE 댓글만, 오래된 순 */
  topLevel: ThreadComment[]
}

export type ReplyTargetRole = 'PRIMARY' | 'COMPANION'

export interface ReplyTarget {
  commentId: string
  /** PRIMARY=사람 댓글(리텐션 목적) · COMPANION=같은 글 봇 댓글(패턴 지우기) */
  role: ReplyTargetRole
  score: number
}

/** 글 하나에 글쓴이 답글이 몇 개까지 자연스러운가 (기존 답글 포함) */
// ── 일 판정 lane (2026-08-07) — 기존 전역 일 판정 상한(10)을 대체한다 ──
//
// 왜 바꿨나: 전역 cap 하나가 실회원·게스트·봇 companion·safety SKIP·ESCALATE를 모두 같이 세서,
//   실회원 댓글이 봇 companion이나 SKIP에 밀려 응답을 못 받는 일이 생겼다.
//   실측(30일): 판정 70건 중 REPLY가 아닌 판정이 43%, cap 도달 2일 중 08-07은 12:40에 소진되어
//   이후 11시간 동안 들어온 실회원 댓글 5건이 무응답으로 남았다.
//   실회원 최상위 댓글은 하루 평균 2건뿐이라, cap 자체가 아니라 "누가 먼저 쓰느냐"가 문제였다.
//
// 그래서 lane을 분리한다. human이 다 차도 companion은 자기 몫으로 돌고, 그 반대도 같다.
// 무제한이 아니다 — 합계 상한은 18건/일이고 실제 후보가 없으면 소비되지 않는다.
export type JudgeLane = 'human' | 'companion'

/** 실회원·게스트 댓글 응답 — North Star(주간 재방문) 직결이라 넉넉히 둔다(실측 수요의 6배) */
export const DAILY_HUMAN_JUDGE_CAP = 12
/** 봇 댓글 companion — 댓글판 패턴 지우기용 보조. 사람 응답을 밀어내지 않도록 낮게 */
export const DAILY_COMPANION_JUDGE_CAP = 6
/** 같은 실회원에게 하루 몇 번까지 답할지 — AI 티 방지(과거 한 유저에게 5회 연속 사례) */
export const PER_USER_DAILY_REPLY_CAP = 2

/**
 * 판정 대상이 어느 lane을 소비하는지.
 * COMPANION은 대상이 사람이어도 companion lane이다 — 사람 응답 몫을 보조가 잠식하지 않게 한다.
 */
export function laneOf(actor: CommentActor, role: ReplyTargetRole): JudgeLane {
  if (role === 'COMPANION') return 'companion'
  return actor === 'REAL_MEMBER' || actor === 'GUEST' ? 'human' : 'companion'
}

export function judgeCapFor(lane: JudgeLane): number {
  return lane === 'human' ? DAILY_HUMAN_JUDGE_CAP : DAILY_COMPANION_JUDGE_CAP
}

/**
 * 처리 우선순위. 낮을수록 먼저다.
 *   0 사람 PRIMARY(REAL_MEMBER·GUEST) → 1 기타 PRIMARY → 2 COMPANION
 * 기존에는 planned가 글 단위로 쌓여서 앞 글의 COMPANION이 뒤 글의 실회원 PRIMARY보다
 * 먼저 cap을 먹었다. 전역 정렬로 그 밀림을 없앤다.
 */
export function judgeOrderRank(actor: CommentActor, role: ReplyTargetRole): number {
  if (role === 'COMPANION') return 2
  return actor === 'REAL_MEMBER' || actor === 'GUEST' ? 0 : 1
}

/** judgeOrderRank 기준 안정 정렬 — 같은 rank 안에서는 원래 순서(작성 시각) 유지 */
export function sortByJudgeOrder<T>(items: T[], pick: (t: T) => { actor: CommentActor; role: ReplyTargetRole }): T[] {
  return items
    .map((item, i) => ({ item, i, rank: judgeOrderRank(pick(item).actor, pick(item).role) }))
    .sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
    .map(x => x.item)
}

export const MAX_AUTHOR_REPLIES_PER_POST = 3
/**
 * 댓글판 밀도에 따른 COMPANION 허용 수.
 * 한산한 글은 애초에 "사람 것만 골라 답했다"가 눈에 안 띄고, 붙이면 부자연스럽기만 하다.
 * 북적이는 글일수록 사람 댓글 하나만 답한 그림이 도드라지므로 더 허용한다.
 */
export function companionQuota(topLevelCount: number): number {
  if (topLevelCount < 5) return 0
  if (topLevelCount <= 7) return 1
  return 2
}

/** COMPANION 후보 최소 점수 — 짧은 감탄·비꼼·단정은 제외한다 */
export const COMPANION_MIN_SCORE = 1

const isHuman = (a: CommentActor) => a === 'REAL_MEMBER' || a === 'GUEST'

/**
 * 답글을 달 가치 점수. 질문·경험 공유는 높고, 짧은 감탄·단정은 낮다.
 * (여기서 내용을 "판단"하지는 않는다 — 최종 판정은 LLM이 하고, 이건 순서를 정할 뿐이다)
 */
export function scoreReplyWorthiness(content: string): number {
  const t = content.trim()
  const compact = t.replace(/\s+/g, '')
  let s = 0
  if (/[?？]|나요|까요|는지|어떠|어때|건가요|하세요\?/.test(t)) s += 3   // 질문 — 답을 기다린다
  if (compact.length >= 30) s += 2                                        // 경험 공유
  else if (compact.length >= 15) s += 1
  if (compact.length <= 10) s -= 2                                        // "ㅋㅋ", "맞아요" 류
  if (/^[ㄱ-ㅎㅏ-ㅣ\s.!~ㅋㅎ]+$/.test(t)) s -= 2                          // 자모/감탄만
  return s
}

/**
 * 글 하나의 댓글판에서 글쓴이 봇이 답할 대상을 고른다.
 *
 * 규칙
 *  1. 이미 글쓴이가 답한 댓글, 실회원이 대화 중인 스레드는 제외한다.
 *  2. 사람(실회원·게스트) 댓글이 PRIMARY다 — 리텐션 목적은 그대로다.
 *  3. **PRIMARY가 생기는 회차에 COMPANION을 같이 고른다.** 다음 회차로 미루면
 *     실유저가 알림을 눌러 들어온 그 순간 화면이 여전히 "내 댓글에만 답글"이라
 *     AI 티 제거라는 목적 자체가 달성되지 않는다.
 *  4. COMPANION 수는 댓글판 밀도로 정한다 — companionQuota(): <5 → 0 · 5~7 → 1 · 8+ → 2.
 *     COMPANION 후보는 봇/게스트/실유저를 가리지 않되, 짧은 감탄·비꼼·단정은 제외한다.
 *  5. 글당 총 답글(기존+신규)은 MAX_AUTHOR_REPLIES_PER_POST를 넘지 않는다.
 *  6. 사람 댓글이 하나도 없으면 아무 것도 고르지 않는다 — 봇끼리 연극을 만들지 않는다.
 */
export function selectThreadReplyTargets(t: ThreadState): ReplyTarget[] {
  const existingAuthorReplies = t.topLevel.filter(c => c.hasAuthorReply).length
  const room = MAX_AUTHOR_REPLIES_PER_POST - existingAuthorReplies
  if (room <= 0) return []

  // 사람이 아예 참여하지 않은 댓글판은 건드리지 않는다(봇끼리 연극 금지).
  const humansAll = t.topLevel.filter(c => isHuman(c.actor))
  if (humansAll.length === 0) return []

  const open = t.topLevel.filter(c => !c.hasAuthorReply && !c.hasRealUserReply)
  const humansOpen = open.filter(c => isHuman(c.actor))
  // PRIMARY(사람 댓글)가 없으면 이 회차엔 아무 것도 하지 않는다.
  // COMPANION은 "사람에게 답하는 김에 같이" 붙이는 것이지, 그것만 따로 붙이지 않는다.
  if (humansOpen.length === 0) return []

  const targets: ReplyTarget[] = []
  const primary = humansOpen
    .map(c => ({ commentId: c.id, role: 'PRIMARY' as const, score: scoreReplyWorthiness(c.content) }))
    .sort((a, b) => b.score - a.score)[0]
  targets.push(primary)

  // 같은 회차에 COMPANION을 붙여, 알림을 눌러 들어온 그 화면에서 이미
  // "글쓴이가 여러 댓글에 답하고 있다"로 보이게 한다.
  const quota = Math.min(companionQuota(t.topLevel.length), room - targets.length)
  if (quota > 0) {
    const companions = open
      .filter(c => c.id !== primary.commentId)
      .map(c => ({ commentId: c.id, role: 'COMPANION' as const, score: scoreReplyWorthiness(c.content) }))
      .filter(c => c.score >= COMPANION_MIN_SCORE) // 짧은 감탄·비꼼·단정 제외
      .sort((a, b) => b.score - a.score)
    for (const c of companions.slice(0, quota)) targets.push(c)
  }

  return targets.slice(0, room)
}

// ── MENOPAUSE 전용 안전 게이트 (순수 — 테스트 대상) ─────────────────────────
// 갱년기톡은 의료·성·정신건강 경계가 가까운 보드라, write 모드에서 LLM 호출 전에
// 위험 댓글을 SKIP으로 확정한다. 답글 목적은 조언이 아니라 "글쓴이의 짧은 공감"이다.

export type MenopauseAuthorReplySafetySkipReason =
  | 'MENOPAUSE_MEDICAL_ADVICE_REQUEST'
  | 'MENOPAUSE_SEXUAL_CONTENT'
  | 'MENOPAUSE_MENTAL_HEALTH_CRISIS'

export interface MenopauseAuthorReplySafetyInput {
  postBoardType: string
  postTitle: string
  targetComment: string
}

const compactKorean = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export function findMenopauseAuthorReplySafetySkip(i: MenopauseAuthorReplySafetyInput): MenopauseAuthorReplySafetySkipReason | null {
  if (i.postBoardType !== 'MENOPAUSE') return null

  const title = compactKorean(i.postTitle)
  const comment = compactKorean(i.targetComment)
  const titleAndComment = `${title} ${comment}`

  if (/(죽고싶|죽을것같|살기싫|자해|극단적|공황|우울증|자살)/.test(comment)) {
    return 'MENOPAUSE_MENTAL_HEALTH_CRISIS'
  }

  if (/(성욕|성관계|성생활|잠자리|섹스|리스|부부관계)/.test(titleAndComment)) {
    return 'MENOPAUSE_SEXUAL_CONTENT'
  }

  const commentForMedical = comment.replace(/금융치료/g, '')
  const hasMedicalTerm = /(호르몬제|호르몬치료|질유산균|항생제|보약|흑염소|영양제|약|처방|주사|수술|시술|검사|피검사|초음파|진단|치료|산부인과|유방외과|병원|방광염|질염|당뇨|유두통증|부작용|수치|갱년기키트)/.test(commentForMedical)
  const asksAdvice = /(먹어도|먹으면|효과|어떻게|어디|가야|가보|해야|될까|인가요|맞나요|좋나요|추천|문의|관리|도움|나을까|해보|받아|상담|찾아|찾으)/.test(commentForMedical)
  const givesAdvice = /(드셔|드시|먹으|챙겨|가보|상담|검사|치료|처방|추천|받아보|찾아|찾으)/.test(commentForMedical)
  if (hasMedicalTerm && (asksAdvice || givesAdvice)) {
    return 'MENOPAUSE_MEDICAL_ADVICE_REQUEST'
  }

  return null
}

// ── Sonnet 프롬프트 (판단+초안 1콜) ─────────────────────────────

export interface AuthorReplyPromptInput {
  postBoardType?: string
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
  const menopauseSafetyBlock = i.postBoardType === 'MENOPAUSE'
    ? `
[갱년기톡 추가 안전 규칙]
- 갱년기톡에서는 의료·성·정신건강 조언을 절대 하지 않는다. 병원/검사/약/호르몬제/영양제/치료/진단/성적 내용/위기 표현은 답하지 말고 ESCALATE한다.
- REPLY는 오직 [내 글]에 이미 드러난 감정·불편·막막함을 짧게 공감하는 수준으로만 쓴다.
- "병원 가보세요", "검사 받아보세요", "약/영양제 드셔보세요", "호르몬 문제예요" 같은 해결책·판단·권유는 금지다.
`
    : ''

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
${menopauseSafetyBlock}

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
