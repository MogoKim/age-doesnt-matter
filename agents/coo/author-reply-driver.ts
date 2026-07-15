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
import { getPersona } from '../seed/persona-data.js'
import {
  findIneligibleReason,
  buildAuthorReplyPrompt,
  parseAuthorReplyDecision,
} from './author-reply-policy.js'

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6' // 판단 품질 우선 — Haiku 강등 금지(창업자 확정)
const client = new Anthropic()

export const AUTHOR_REPLY_ACTION = 'AUTHOR_REPLY_DRYRUN'
const DAILY_JUDGE_CAP = 10 // 하루 최대 판정 수
const LOOKBACK_HOURS = 48

const strip = (h: string | null) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const isBotEmail = (email: string | null | undefined) => (email ?? '').endsWith('@unao.bot')

function kstMidnight(): Date {
  return new Date(new Date(Date.now() + 9 * 3600_000).setUTCHours(0, 0, 0, 0) - 9 * 3600_000)
}

export async function main(): Promise<void> {
  const started = Date.now()

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

  // 후보: 최근 48h, BOT/SHEET 글의 최상위 댓글 (부모글·작성자·답글까지 로드)
  const candidates = await prisma.comment.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - LOOKBACK_HOURS * 3600_000) },
      parentId: null,
      post: { source: { in: ['BOT', 'SHEET'] }, boardType: { in: ['STORY', 'LIFE2', 'HUMOR'] } },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      content: true,
      authorId: true,
      guestNickname: true,
      parentId: true,
      author: { select: { email: true } },
      post: {
        select: {
          id: true, title: true, content: true, source: true, boardType: true, authorId: true,
          author: { select: { email: true } },
          comments: { select: { id: true, content: true, parentId: true, authorId: true, author: { select: { email: true } } } },
        },
      },
    },
  })

  let judged = 0
  const summary: Record<string, number> = { REPLY: 0, SKIP: 0, ESCALATE: 0, ERROR: 0 }

  for (const c of candidates) {
    if (todayCount + judged >= DAILY_JUDGE_CAP) break
    if (judgedCommentIds.has(c.id)) continue

    const replies = c.post.comments.filter(r => r.parentId === c.id)
    const ineligible = findIneligibleReason({
      postSource: c.post.source,
      postBoardType: c.post.boardType,
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

    // 글쓴이 봇 페르소나 역추적: bot-{personaId}@unao.bot
    const authorEmail = c.post.author?.email ?? ''
    const personaId = authorEmail.match(/^bot-([a-z]+)@unao\.bot$/i)?.[1]?.toUpperCase()
    if (!personaId) continue
    let persona
    try {
      persona = getPersona(personaId)
    } catch {
      continue
    }

    const prompt = buildAuthorReplyPrompt({
      personaNickname: persona.nickname,
      personaPersonality: persona.personality,
      personaStyle: persona.style,
      personaSpeechPatterns: persona.speech_patterns,
      postTitle: c.post.title,
      postExcerpt: strip(c.post.content).slice(0, 600),
      priorComments: c.post.comments.filter(x => x.id !== c.id && !x.parentId).slice(0, 3).map(x => strip(x.content).slice(0, 80)),
      targetComment: strip(c.content).slice(0, 500),
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

      await prisma.botLog.create({
        data: {
          botType: 'COO',
          status: 'SUCCESS',
          action: AUTHOR_REPLY_ACTION,
          logData: {
            dryRun: true,
            commentId: c.id,
            postId: c.post.id,
            personaId,
            commentPreview: strip(c.content).slice(0, 100),
            verdict,
            reason: decision?.reason ?? '파싱 실패 — ESCALATE 처리',
            replyDraft: decision?.reply ?? null,
          },
        },
      })
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
    `[AuthorReply] dry-run 완료 — 판정 ${judged}건 (REPLY ${summary.REPLY} / SKIP ${summary.SKIP} / ESCALATE ${summary.ESCALATE} / ERROR ${summary.ERROR}), ${Math.round((Date.now() - started) / 1000)}s`,
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
