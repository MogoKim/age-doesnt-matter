// COO 에이전트 — 작성자 봇 대댓글 dry-run (2026-07-15)
// BOT/SHEET 글의 실회원·게스트 최상위 댓글에 글쓴이 봇이 답할지 Sonnet으로 판정하고
// **초안만 BotLog(AUTHOR_REPLY_DRYRUN)에 기록한다. Comment write 절대 없음.**
// 배경: 14일 실측 — 실회원 댓글 13건 전원 무응답(응답률 0%). write 전환은 dry-run 채점 후 별도 PR.
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { createWithUsage } from '../core/ai-usage.js'
import { resolveAuthorPersonaContext } from './author-reply-persona.js'
import {
  findIneligibleReason,
  buildAuthorReplyPrompt,
  parseAuthorReplyDecision,
  resolveAuthorReplyMode,
  shouldWriteReply,
  checkWritePreconditions,
  shouldNotifyAuthorReply,
  findMenopauseAuthorReplySafetySkip,
  NON_BOT_COMMENT_AUTHOR_WHERE,
  selectThreadReplyTargets,
  isRealUserProviderId,
  type CommentActor,
} from './author-reply-policy.js'

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6' // 판단 품질 우선 — Haiku 강등 금지(창업자 확정)
const client = new Anthropic()

export const AUTHOR_REPLY_ACTION = 'AUTHOR_REPLY_DRYRUN'   // 판정 로그(일 상한 카운트 + 중복 dedup 소스) — mode 무관 항상 기록
export const AUTHOR_REPLY_WRITE_ACTION = 'AUTHOR_REPLY_WRITE' // write 모드 실제 작성 성공/실패 전용 로그
const DAILY_JUDGE_CAP = 10 // 하루 최대 판정 수 (write 모드에서도 불변 — REPLY는 이 상한 내에서 전부 작성)
const LOOKBACK_HOURS = 48

type WriteOutcome = 'WRITTEN' | 'DUP_SKIP' | 'PRECONDITION_SKIP'

/**
 * write 모드: 대상 유저 댓글(parentCommentId)에 글쓴이 봇의 대댓글을 실제 생성.
 * - write **직전** parent comment + post 상태를 재조회해 사전조건 전체 재검증(checkWritePreconditions):
 *   parent 존재/ACTIVE/최상위/postId 일치, post 존재/PUBLISHED/BOT·SHEET/STORY·LIFE2·HUMOR·MENOPAUSE/authorId 존재,
 *   같은 parent에 작성자 봇 ACTIVE 답글 없음. 하나라도 실패 → create 없이 skip(outcome/reason 반환).
 * - authorId는 재조회한 post.authorId를 authoritative로 사용.
 * - Comment.create + post.commentCount++ + 작성자 user.commentCount++ + lastEngagedAt 갱신(원자적)
 *   (trendingScore는 src/lib import 금지로 미갱신 — reply-chain-driver와 동일 수준)
 */
async function writeAuthorReply(p: {
  postId: string
  parentCommentId: string
  content: string
}): Promise<{ outcome: WriteOutcome; commentId: string | null; reason: string | null }> {
  // write 직전 재조회 스냅샷
  const [parent, post] = await Promise.all([
    prisma.comment.findUnique({
      where: { id: p.parentCommentId },
      select: { status: true, parentId: true, postId: true },
    }),
    prisma.post.findUnique({
      where: { id: p.postId },
      select: { status: true, source: true, boardType: true, authorId: true },
    }),
  ])

  // 같은 parent에 작성자 봇이 이미 ACTIVE 답글을 달았는지 (재조회 — 중복 방어)
  let authorAlreadyReplied = false
  if (post?.authorId) {
    const existing = await prisma.comment.findFirst({
      where: { postId: p.postId, parentId: p.parentCommentId, authorId: post.authorId, status: 'ACTIVE' },
      select: { id: true },
    })
    authorAlreadyReplied = Boolean(existing)
  }

  const pre = checkWritePreconditions({ targetPostId: p.postId, parent, post, authorAlreadyReplied })
  if (!pre.ok) {
    // 이미 답글 존재 = DUP_SKIP, 그 외 조건 실패 = PRECONDITION_SKIP
    const outcome: WriteOutcome = pre.reason === 'ALREADY_REPLIED_BY_AUTHOR' ? 'DUP_SKIP' : 'PRECONDITION_SKIP'
    return { outcome, commentId: null, reason: pre.reason }
  }

  const authorId = post!.authorId as string
  const [created] = await prisma.$transaction([
    prisma.comment.create({
      data: { postId: p.postId, authorId, content: p.content, parentId: p.parentCommentId, status: 'ACTIVE' },
      select: { id: true },
    }),
    prisma.post.update({ where: { id: p.postId }, data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() } }),
    prisma.user.update({ where: { id: authorId }, data: { commentCount: { increment: 1 } } }),
  ])
  return { outcome: 'WRITTEN', commentId: created.id, reason: null }
}

/**
 * write REPLY 성공 후 원댓글 작성자에게 "답글 달렸어요" 종모양 알림(Notification) 생성.
 * - 일반 대댓글 경로(src notifyUser)와 동일 규격: type=COMMENT, content, postId, fromUserId.
 *   src notifyUser는 agents→src import 금지라 못 부르므로 Notification 생성만 여기서 직접 수행(OS 푸시는 이번 범위 밖).
 * - 수신자 실회원(providerId 숫자)+ACTIVE+게스트/봇/자기자신 아님일 때만(shouldNotifyAuthorReply).
 * - 중복 방지: 같은 (수신자·글·발신봇·COMMENT) 알림이 이미 있으면 skip.
 * - 실패는 catch — 댓글 작성/발행에 영향 없음(부가 기능).
 */
/**
 * 보드 → URL 접두사. src/lib/board-registry가 SSoT지만 agents→src 런타임 import 금지라
 * 여기서 재정의한다(agents/cmo/social-poster.ts·agents/community/sheet-scraper.ts와 동일 관례).
 * 후보 보드(ELIGIBLE_BOARDS)와 동일한 4개만 둔다 — 그 밖은 앵커 없이 기존 동작.
 */
const BOARD_URL_PREFIX_LOCAL: Record<string, string> = {
  STORY: '/community/stories',
  LIFE2: '/community/life2',
  HUMOR: '/community/humor',
  MENOPAUSE: '/community/menopause',
}

/**
 * 알림 클릭 시 이동할 경로. 답글 댓글 위치(#comment-{id})까지 지정해
 * 글 상단이 아니라 "달린 답글"이 바로 보이게 한다(리텐션 루프).
 * - slug가 있으면 canonical slug 사용(CUID→slug 301/308 왕복 제거).
 * - 보드 매핑이 없거나 답글 id가 없으면 null → 기존 동작(buildNotificationLinkUrl이 postId로 글 URL 생성).
 */
function buildAuthorReplyLinkUrl(i: {
  boardType: string
  postSlug: string | null
  postId: string
  replyCommentId: string | null
}): string | null {
  const prefix = BOARD_URL_PREFIX_LOCAL[i.boardType]
  if (!prefix || !i.replyCommentId) return null
  return `${prefix}/${i.postSlug ?? i.postId}#comment-${i.replyCommentId}`
}

async function createAuthorReplyNotification(p: {
  recipient: { id: string | null; providerId: string | null; status: string } | null
  fromUserId: string
  postId: string
  fromNickname: string
  /** 답글 위치 앵커 포함 경로. null이면 기존처럼 postId 기반 글 URL로 이동한다. */
  linkUrl: string | null
}): Promise<{ created: boolean; reason: string | null }> {
  const gate = shouldNotifyAuthorReply(p.recipient, p.fromUserId)
  if (!gate.ok) return { created: false, reason: gate.reason }
  const recipientId = p.recipient!.id as string
  try {
    const dup = await prisma.notification.findFirst({
      where: { userId: recipientId, type: 'COMMENT', postId: p.postId, fromUserId: p.fromUserId },
      select: { id: true },
    })
    if (dup) return { created: false, reason: 'NOTIF_DUP' }
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'COMMENT',
        content: `${p.fromNickname}님이 회원님의 댓글에 답글을 남겼어요`,
        postId: p.postId,
        fromUserId: p.fromUserId,
        ...(p.linkUrl ? { linkUrl: p.linkUrl } : {}),
      },
    })
    return { created: true, reason: null }
  } catch (err) {
    return { created: false, reason: `ERROR:${err instanceof Error ? err.message.slice(0, 40) : String(err).slice(0, 40)}` }
  }
}

const strip = (h: string | null) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const isBotEmail = (email: string | null | undefined) => (email ?? '').endsWith('@unao.bot')

function kstMidnight(): Date {
  return new Date(new Date(Date.now() + 9 * 3600_000).setUTCHours(0, 0, 0, 0) - 9 * 3600_000)
}

export async function main(): Promise<void> {
  const started = Date.now()
  const MODE = resolveAuthorReplyMode(process.env.AUTHOR_REPLY_MODE) // 기본 dry-run — 'write'일 때만 실제 작성
  console.log(`[AuthorReply] 모드: ${MODE}${MODE === 'write' ? ' (verdict=REPLY 후보 실제 작성)' : ' (초안만 기록, Comment write 없음)'}`)

  // 일 상한 + 이미 판정한 댓글(중복 방지) — 과거 전체 BotLog에서 commentId 수집
  const todayCount = await prisma.botLog.count({
    where: { action: AUTHOR_REPLY_ACTION, createdAt: { gte: kstMidnight() } },
  })
  if (todayCount >= DAILY_JUDGE_CAP) {
    console.log(`[AuthorReply] 일 판정 상한(${DAILY_JUDGE_CAP}) 도달 — 스킵`)
    return
  }
  const pastLogs = await prisma.botLog.findMany({
    where: { action: AUTHOR_REPLY_ACTION },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { logData: true },
  })
  const judgedCommentIds = new Set(
    pastLogs.map(l => (l.logData as { commentId?: string } | null)?.commentId).filter(Boolean) as string[],
  )

  // 후보: 최근 48h, BOT/SHEET 글의 최상위 **비봇** 댓글 (부모글·작성자·답글까지 로드)
  // 봇 wave 댓글을 DB단에서 먼저 제외 — take 200이 봇 댓글로 소진되어 사람 댓글이 잘리던 문제(NON_BOT_COMMENT_AUTHOR_WHERE 주석 참조)
  const candidates = await prisma.comment.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - LOOKBACK_HOURS * 3600_000) },
      parentId: null,
      status: 'ACTIVE', // 숨김/삭제 댓글 판정 금지
      post: { source: { in: ['BOT', 'SHEET'] }, boardType: { in: ['STORY', 'LIFE2', 'HUMOR', 'MENOPAUSE'] }, status: 'PUBLISHED' },
      ...NON_BOT_COMMENT_AUTHOR_WHERE,
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      content: true,
      authorId: true,
      guestNickname: true,
      parentId: true,
      status: true,
      author: { select: { email: true, providerId: true, status: true } }, // providerId/status: 종모양 알림 실회원 판정용
      post: {
        select: {
          // slug: 알림 링크를 canonical slug로 만들기 위한 조회 필드 추가(2026-08-06).
          //   where/orderBy/take 불변 — 후보 선정에는 영향이 없다.
          id: true, slug: true, title: true, content: true, source: true, boardType: true, authorId: true, status: true,
          author: { select: { email: true } },
          // ACTIVE 답글만 — 숨김/삭제 답글이 REAL_USERS_IN_THREAD/ALREADY_REPLIED_BY_AUTHOR를 오판시키지 않게
          // guestNickname/providerId: 댓글판 actor 분류(REAL_MEMBER·GUEST·BOT)용 — select 필드 추가만, where/take 불변.
          comments: { where: { status: 'ACTIVE' }, select: { id: true, content: true, parentId: true, authorId: true, guestNickname: true, author: { select: { email: true, providerId: true } } } },
        },
      },
    },
  })

  let judged = 0
  let written = 0 // write 모드 실제 작성 성공 수
  const summary: Record<string, number> = { REPLY: 0, SKIP: 0, ESCALATE: 0, ERROR: 0 }

  // ── 댓글판 흐름 기반 대상 선정 (2026-08-06) ────────────────────────────
  // 1단계 조회(candidates)는 "사람이 댓글 단 글"을 찾는 용도다. 실제 답할 대상은
  // 그 글의 **댓글판 전체**를 보고 selectThreadReplyTargets가 고른다 —
  // 사람 댓글에만 답해서 "내 댓글만 감지한다"는 티가 나던 패턴을 없애기 위함이다.
  // post.comments가 이미 로드돼 있어 추가 DB 조회는 없다.
  // 댓글판 처리에 필요한 최소 shape — prisma 타입이 이 파일에서 unknown이라 로컬로 고정한다.
  type ThreadRow = {
    id: string
    content: string
    parentId: string | null
    authorId: string | null
    guestNickname: string | null
    author?: { email: string | null; providerId: string | null } | null
  }
  type PostRow = {
    id: string
    slug: string | null
    title: string
    content: string
    source: string
    boardType: string
    status: string
    authorId: string | null
    author?: { email: string | null } | null
    comments: ThreadRow[]
  }
  type CandidateRow = { id: string; post: PostRow }

  const actorOf = (x: ThreadRow): CommentActor => {
    if (!x.authorId && x.guestNickname) return 'GUEST'
    if (isBotEmail(x.author?.email)) return 'BOT'
    if (isRealUserProviderId(x.author?.providerId)) return 'REAL_MEMBER'
    return 'NON_REAL'
  }

  const postReps = new Map<string, PostRow>()
  for (const c of candidates as CandidateRow[]) if (!postReps.has(c.post.id)) postReps.set(c.post.id, c.post)

  const planned: Array<{ comment: ThreadRow; post: PostRow; role: string }> = []
  for (const post of postReps.values()) {
    const all: ThreadRow[] = post.comments
    const tops = all.filter((x: ThreadRow) => x.parentId === null)
    const repliesOf = (id: string) => all.filter((x: ThreadRow) => x.parentId === id)
    const chosen = selectThreadReplyTargets({
      postId: post.id,
      topLevel: tops.map((x: ThreadRow) => ({
        id: x.id,
        actor: actorOf(x),
        content: strip(x.content),
        hasAuthorReply: repliesOf(x.id).some((r: ThreadRow) => r.authorId === post.authorId),
        hasRealUserReply: repliesOf(x.id).some((r: ThreadRow) => !!r.authorId && !isBotEmail(r.author?.email)),
      })),
    })
    for (const t of chosen) {
      const cm = tops.find((x: ThreadRow) => x.id === t.commentId)
      if (cm) planned.push({ comment: cm, post, role: t.role })
    }
  }
  console.log(`[AuthorReply] 댓글판 ${postReps.size}개 → 대상 ${planned.length}건 (PRIMARY ${planned.filter(p => p.role === 'PRIMARY').length} · COMPANION ${planned.filter(p => p.role === 'COMPANION').length})`)

  for (const plan of planned) {
    if (todayCount + judged >= DAILY_JUDGE_CAP) break
    // 기존 루프가 쓰던 형태로 맞춘다(댓글 + 글). status는 조회 시 ACTIVE만 담겼다.
    const c = { ...plan.comment, status: 'ACTIVE' as const, post: plan.post }
    if (judgedCommentIds.has(c.id)) continue

    const replies = c.post.comments.filter(r => r.parentId === c.id)
    const ineligible = findIneligibleReason({
      postSource: c.post.source,
      postBoardType: c.post.boardType,
      postStatus: c.post.status,
      commentStatus: c.status,
      postAuthorId: c.post.authorId,
      comment: {
        parentId: c.parentId,
        authorId: c.authorId,
        guestNickname: c.guestNickname,
        isBotAuthor: isBotEmail(c.author?.email),
      },
      replies: replies.map(r => ({ authorId: r.authorId, isBotAuthor: isBotEmail(r.author?.email) })),
    })
    if (ineligible) continue

    // 글쓴이 봇 페르소나 역추적 — bot-*(persona-data) + curator-*(curator-shared) 양 체계 지원.
    // curator-* 사각(실회원 댓글 ~15% skip) 해소 (2026-07-15). 알 수 없는 id는 기존처럼 skip.
    const authorEmail = c.post.author?.email ?? ''
    const persona = resolveAuthorPersonaContext(authorEmail)
    if (!persona) continue
    const personaId = persona.personaId
    const postExcerpt = strip(c.post.content).slice(0, 600)
    const targetComment = strip(c.content).slice(0, 500)

    const menopauseSafetySkip = findMenopauseAuthorReplySafetySkip({
      postBoardType: c.post.boardType,
      postTitle: c.post.title,
      targetComment,
    })
    if (menopauseSafetySkip) {
      judged++
      summary.SKIP++
      await prisma.botLog.create({
        data: {
          botType: 'COO',
          status: 'SUCCESS',
          action: AUTHOR_REPLY_ACTION,
          logData: {
            dryRun: MODE !== 'write',
            mode: MODE,
            commentId: c.id,
            postId: c.post.id,
            boardType: c.post.boardType,
            personaId,
            commentPreview: targetComment.slice(0, 100),
            verdict: 'SKIP',
            reason: menopauseSafetySkip,
            replyDraft: null,
            writtenCommentId: null,
            menopauseSafetySkipReason: menopauseSafetySkip,
          },
        },
      })
      console.log(`[AuthorReply] SKIP (${personaId}/${menopauseSafetySkip}) "${targetComment.slice(0, 30)}"`)
      continue
    }

    const prompt = buildAuthorReplyPrompt({
      postBoardType: c.post.boardType,
      personaNickname: persona.nickname,
      personaPersonality: persona.personality,
      personaStyle: persona.style,
      personaSpeechPatterns: persona.speechPatterns,
      postTitle: c.post.title,
      postExcerpt,
      priorComments: c.post.comments.filter(x => x.id !== c.id && !x.parentId).slice(0, 3).map(x => strip(x.content).slice(0, 80)),
      targetComment,
      targetAuthorLabel: c.authorId ? '회원' : `게스트 ${c.guestNickname ?? ''}`.trim(),
    })

    judged++
    try {
      const res = await createWithUsage(client, AUTHOR_REPLY_ACTION, {
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
      const decision = parseAuthorReplyDecision(text)
      const verdict = decision?.verdict ?? 'ESCALATE' // 파싱 실패는 보수적으로 사람 검토
      summary[decision ? verdict : 'ERROR']++

      // ── write 모드: verdict=REPLY만 실제 대댓글 생성. SKIP/ESCALATE/ERROR/dry-run은 절대 write 금지 ──
      let writtenCommentId: string | null = null
      let writeOutcome: 'WRITTEN' | 'DUP_SKIP' | 'PRECONDITION_SKIP' | 'FAILED' | null = null
      if (shouldWriteReply(MODE, verdict, Boolean(decision?.reply)) && decision?.reply) {
        try {
          const w = await writeAuthorReply({
            postId: c.post.id,
            parentCommentId: c.id,
            content: decision.reply,
          })
          writeOutcome = w.outcome
          if (w.outcome === 'WRITTEN') {
            writtenCommentId = w.commentId
          } else {
            // DUP_SKIP / PRECONDITION_SKIP — create 없이 skip. AUTHOR_REPLY_WRITE 로그에 outcome/reason 기록.
            console.log(`[AuthorReply] write 스킵(${w.outcome}/${w.reason}): parent=${c.id}`)
            await prisma.botLog.create({
              data: {
                botType: 'COO', status: 'SKIPPED', action: AUTHOR_REPLY_WRITE_ACTION,
                logData: { dryRun: false, mode: 'write', outcome: w.outcome, reason: w.reason, postId: c.post.id, boardType: c.post.boardType, commentId: c.id, parentCommentId: c.id, personaId, verdict, replyDraft: decision?.reply ?? null },
              },
            }).catch(() => {})
          }
        } catch (werr) {
          writeOutcome = 'FAILED'
          const msg = werr instanceof Error ? werr.message : String(werr)
          console.warn(`[AuthorReply] write 실패(다음 후보 계속): parent=${c.id} — ${msg}`)
          await prisma.botLog.create({
            data: {
              botType: 'COO', status: 'FAILED', action: AUTHOR_REPLY_WRITE_ACTION,
              logData: { dryRun: false, mode: 'write', outcome: 'FAILED', postId: c.post.id, boardType: c.post.boardType, commentId: c.id, parentCommentId: c.id, personaId, verdict, reason: decision?.reason ?? '', replyDraft: decision?.reply ?? null, error: msg },
            },
          }).catch(() => {})
        }
      }

      // 판정 로그 — mode 무관 항상 기록(일 상한 카운트 + dedup 소스). write 결과 반영.
      await prisma.botLog.create({
        data: {
          botType: 'COO',
          status: 'SUCCESS',
          action: AUTHOR_REPLY_ACTION,
          logData: {
            dryRun: MODE !== 'write',
            mode: MODE,
            commentId: c.id,
            postId: c.post.id,
            boardType: c.post.boardType,
            personaId,
            commentPreview: strip(c.content).slice(0, 100),
            verdict,
            reason: decision?.reason ?? '파싱 실패 — ESCALATE 처리',
            replyDraft: decision?.reply ?? null,
            writtenCommentId,
          },
        },
      })

      // write 성공 별도 로그 (writtenCommentId 등 상세)
      if (writeOutcome === 'WRITTEN' && writtenCommentId) {
        written++
        // 종모양 알림 — 원댓글 작성자에게 "답글 달렸어요"(리텐션 루프 연결). 실패해도 발행/댓글에 영향 없음.
        const notif = await createAuthorReplyNotification({
          recipient: c.authorId ? { id: c.authorId, providerId: c.author?.providerId ?? null, status: c.author?.status ?? 'UNKNOWN' } : null,
          fromUserId: c.post.authorId!,
          postId: c.post.id,
          fromNickname: persona.nickname,
          // 새로 쓴 답글 위치로 보낸다 — 사용자가 "무슨 답이 왔는지"를 바로 본다.
          linkUrl: buildAuthorReplyLinkUrl({
            boardType: c.post.boardType,
            postSlug: c.post.slug ?? null,
            postId: c.post.id,
            replyCommentId: writtenCommentId,
          }),
        })
        await prisma.botLog.create({
          data: {
            botType: 'COO', status: 'SUCCESS', action: AUTHOR_REPLY_WRITE_ACTION,
            logData: { dryRun: false, mode: 'write', postId: c.post.id, boardType: c.post.boardType, commentId: c.id, parentCommentId: c.id, writtenCommentId, personaId, verdict, reason: decision?.reason ?? '', replyDraft: decision?.reply ?? null, notificationCreated: notif.created, notificationSkipReason: notif.created ? null : notif.reason },
          },
        })
        console.log(`[AuthorReply] ✍️ WRITE 성공 (${personaId}) → comment ${writtenCommentId} (post ${c.post.id}) · 알림 ${notif.created ? '생성' : `skip(${notif.reason})`}`)
      }

      console.log(`[AuthorReply] ${verdict} (${personaId}) "${strip(c.content).slice(0, 30)}" — ${decision?.reason ?? '파싱 실패'}`)

      if (verdict === 'ESCALATE') {
        await notifySlack({
          level: 'warning',
          agent: 'COO',
          title: '🙋 작성자 대댓글 — 사람 검토 필요 (dry-run)',
          body: `글: ${c.post.title.slice(0, 40)}\n댓글: ${strip(c.content).slice(0, 80)}\n사유: ${decision?.reason ?? '파싱 실패'}`,
        }).catch(() => {})
      }
    } catch (err) {
      summary.ERROR++
      console.warn(`[AuthorReply] 판정 실패(계속 진행): ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(
    `[AuthorReply] ${MODE} 완료 — 판정 ${judged}건 (REPLY ${summary.REPLY} / SKIP ${summary.SKIP} / ESCALATE ${summary.ESCALATE} / ERROR ${summary.ERROR})` +
    `${MODE === 'write' ? ` / 실제 작성 ${written}건` : ''}, ${Math.round((Date.now() - started) / 1000)}s`,
  )
}

const isDirectRun = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
if (isDirectRun) {
  main()
    .catch(err => {
      console.error('[AuthorReply] 실행 실패:', err)
      process.exitCode = 1
    })
    .finally(() => disconnect())
}
