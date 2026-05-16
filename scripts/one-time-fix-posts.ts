// LOCAL ONLY — 일회성 보정: 마크다운 수정 + 댓글 0 BOT 게시글 댓글 추가
/* eslint-disable */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import Anthropic from '@anthropic-ai/sdk'
import { PERSONAS } from '../agents/seed/persona-data.js'
import { calculateTrendingScore } from '../src/lib/utils/trending.js'

function parseDbUrl(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname, port: parseInt(u.port, 10) || 5432,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: u.pathname.slice(1) || 'postgres',
  }
}
const p = parseDbUrl(process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? '')
const pool = new Pool({ ...p, ssl: { rejectUnauthorized: false }, max: 5 })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never)
const ai = new Anthropic()

// ── 보정 대상 ──────────────────────────────────────────────
const MARKDOWN_ID = 'cmoyztqb'

const TARGETS: { board: string; id: string }[] = [
  { board: 'STORY', id: 'cmp26tjk' }, { board: 'STORY', id: 'cmp25sv0' }, { board: 'STORY', id: 'cmojkj8k' },
  { board: 'LIFE2', id: 'cmp29hkq' }, { board: 'LIFE2', id: 'cmozohmk' }, { board: 'LIFE2', id: 'cmoznltu' },
  { board: 'LIFE2', id: 'cmoy7wbh' }, { board: 'LIFE2', id: 'cmowj7ip' }, { board: 'LIFE2', id: 'cmout55k' },
  { board: 'LIFE2', id: 'cmonzlwx' }, { board: 'LIFE2', id: 'cmonzlm5' }, { board: 'LIFE2', id: 'cmonzlf6' },
  { board: 'LIFE2', id: 'cmojo047' }, { board: 'LIFE2', id: 'cmofpxk1' },
  { board: 'HUMOR', id: 'cmotmoqp' },
]

const BOARD_PERSONAS: Record<string, string[]> = {
  STORY: ['A', 'U'], LIFE2: ['AK', 'AQ'], HUMOR: ['C', 'AF'],
}

// ── 헬퍼 ───────────────────────────────────────────────────
async function getBotUserId(personaId: string): Promise<string | null> {
  const email = `bot-${personaId.toLowerCase()}@unao.bot`
  // @ts-expect-error one-time script
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  return user?.id ?? null
}

async function genComment(personaId: string, title: string, body: string): Promise<string> {
  const persona = PERSONAS[personaId]
  if (!persona) return ''
  const system = `당신은 ${persona.nickname}(${persona.age}세 ${persona.gender})입니다.\n성격: ${persona.personality}\n말투 예시: ${(persona.examples ?? []).slice(0, 2).join(' / ')}\n\n규칙: 2~3문장 짧은 댓글. 마크다운 금지. 개행 금지. 공감·경험 공유 위주.`
  const res = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 120, system,
    messages: [{ role: 'user', content: `댓글 달아주세요.\n제목: ${title}\n내용: ${body.slice(0, 200)}` }],
  })
  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  return text.replace(/[*#_`~]/g, '').replace(/\n+/g, ' ').trim()
}

// ── 0-A. trendingScore=0 + engagement 있는 글 일괄 재계산 ──────
async function recalcTrendingScores() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // @ts-expect-error one-time script
  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      trendingScore: 0,
      createdAt: { gte: sevenDaysAgo },
      OR: [{ likeCount: { gte: 1 } }, { commentCount: { gte: 1 } }],
    },
    select: { id: true, likeCount: true, commentCount: true, viewCount: true },
  })
  let updated = 0
  for (const post of posts) {
    const score = calculateTrendingScore(post.likeCount, post.commentCount, post.viewCount)
    if (score > 0) {
      // @ts-expect-error one-time script
      await prisma.post.update({ where: { id: post.id }, data: { trendingScore: score } })
      updated++
    }
  }
  console.log(`[Fix] trendingScore 재계산 ${updated}/${posts.length}개`)
}

// ── 0. 빈 제목 글 soft-delete ───────────────────────────────
async function fixEmptyTitles() {
  // @ts-expect-error one-time script
  const result = await prisma.post.updateMany({
    where: { status: 'PUBLISHED', title: '' },
    data: { status: 'DELETED' },
  })
  console.log(`[Fix] 빈 제목 글 ${result.count}개 → DELETED`)
}

// ── 1. 마크다운 수정 ────────────────────────────────────────
async function fixMarkdown() {
  // @ts-expect-error one-time script
  const post = await prisma.post.findUnique({ where: { id: MARKDOWN_ID }, select: { title: true, content: true } })
  if (!post) { console.log('[SKIP] markdown 수정 대상 없음'); return }
  const newTitle = post.title.replace(/^\*+\s*/, '').trim()
  const newContent = (post.content ?? '').replace(/<p>\s*\*+\s*<\/p>\s*/g, '')
  // @ts-expect-error one-time script
  await prisma.post.update({ where: { id: MARKDOWN_ID }, data: { title: newTitle, content: newContent } })
  console.log(`[FIXED] "${post.title}" → "${newTitle}"`)
}

// ── 2. 댓글 추가 ────────────────────────────────────────────
async function addComments(board: string, postId: string) {
  // @ts-expect-error one-time script
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, title: true, content: true } })
  if (!post) { console.log(`[SKIP] 게시글 없음: ${postId}`); return 0 }
  const body = (post.content ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const personas = BOARD_PERSONAS[board] ?? ['A', 'U']
  let added = 0
  for (const pid of personas) {
    const uid = await getBotUserId(pid)
    if (!uid) { console.log(`[SKIP] 봇 유저 없음 persona=${pid}`); continue }
    const text = await genComment(pid, post.title, body)
    if (!text) { console.log(`[SKIP] 빈 댓글 ${postId.slice(0, 8)} persona=${pid}`); continue }
    // @ts-expect-error one-time script
    await prisma.$transaction([
      // @ts-expect-error one-time script
      prisma.comment.create({ data: { postId: post.id, authorId: uid, content: text } }),
      // @ts-expect-error one-time script
      prisma.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() } }),
    ])
    console.log(`[OK] ${board} ${postId.slice(0, 8)} ${pid}: "${text.slice(0, 50)}"`)
    added++
    await new Promise(r => setTimeout(r, 1500))
  }
  return added
}

// ── main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== 게시글 보정 시작 ===\n')
  await recalcTrendingScores()
  await fixEmptyTitles()
  await fixMarkdown()
  console.log('\n--- 댓글 추가 (15건 × 2) ---')
  let total = 0
  for (const { board, id } of TARGETS) total += await addComments(board, id)
  console.log(`\n=== 완료: 댓글 ${total}개 추가 ===`)
  // @ts-expect-error one-time script
  await prisma.$disconnect()
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
