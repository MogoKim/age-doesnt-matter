/**
 * Morning Audit — 2026-05-18 00:00~12:10 KST
 * 게시글·댓글·대댓글 전수 검사 + 정책 교차 검증
 * 실행: npx tsx agents/scripts/_audit-18morning.ts
 * 출력: /tmp/audit-18morning.json (Playwright spec이 읽음)
 */

import { writeFileSync } from 'fs'
import { prisma, disconnect } from '../core/db.js'

// ── 시간 범위 (KST = UTC+9) ──────────────────────────────
const START_UTC  = new Date('2026-05-17T15:00:00Z') // 00:00 KST
const END_UTC    = new Date('2026-05-18T03:10:00Z') // 12:10 KST
const NIGHT_END  = new Date('2026-05-17T23:20:00Z') // 08:20 KST (첫 슬롯 직전)

// ── 기대 슬롯 (±5분 허용창) ──────────────────────────────
const SLOTS = [
  { kst: '08:20', s: new Date('2026-05-17T23:15:00Z'), e: new Date('2026-05-17T23:25:00Z') },
  { kst: '09:05', s: new Date('2026-05-18T00:00:00Z'), e: new Date('2026-05-18T00:10:00Z') },
  { kst: '09:50', s: new Date('2026-05-18T00:45:00Z'), e: new Date('2026-05-18T00:55:00Z') },
  { kst: '10:35', s: new Date('2026-05-18T01:30:00Z'), e: new Date('2026-05-18T01:40:00Z') },
  { kst: '11:20', s: new Date('2026-05-18T02:15:00Z'), e: new Date('2026-05-18T02:25:00Z') },
  { kst: '12:05', s: new Date('2026-05-18T03:00:00Z'), e: new Date('2026-05-18T03:10:00Z') },
]

// ── 정책 상수 ────────────────────────────────────────────
const HARDCAP: Record<string, number> = { HEALTH: 22, FAMILY: 11 }
const DEFAULT_CAP = 6
const BOT_MAX_PER_POST = 5
const TITLE_MIN = 15
const TITLE_MAX = 30
const CONTENT_MIN = 150
const CONTENT_MAX = 400
const WAVE_WINDOWS = [
  { label: 'wave1', minMin: 0,  maxMin: 2  },
  { label: 'wave2', minMin: 4,  maxMin: 7  },
  { label: 'wave3', minMin: 28, maxMin: 33 },
  { label: 'wave4', minMin: 58, maxMin: 63 },
]
const USER_WAVE_WINDOWS = [
  { label: 'wave1', minMin: 0,  maxMin: 2,  count: 1 },
  { label: 'wave2', minMin: 9,  maxMin: 12, count: 2 },
  { label: 'wave3', minMin: 28, maxMin: 33, count: 3 },
  { label: 'wave4', minMin: 58, maxMin: 63, count: 3 },
]

// ── 제외 페르소나 ────────────────────────────────────────
const EXCLUDED_ALWAYS = new Set([
  'bot-en1@unao.bot','bot-en2@unao.bot','bot-en3@unao.bot','bot-en4@unao.bot','bot-en5@unao.bot',
  'bot-n1@unao.bot', 'bot-n2@unao.bot', 'bot-n3@unao.bot', 'bot-n4@unao.bot', 'bot-n5@unao.bot',
])
const HUMOR_ONLY = new Set(['bot-c@unao.bot','bot-af@unao.bot','bot-ao@unao.bot','bot-ay@unao.bot'])


// ── 유틸 ─────────────────────────────────────────────────
function toKST(d: Date) {
  const h = (d.getUTCHours() + 9) % 24
  const m = d.getUTCMinutes()
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}
function diffMin(a: Date, b: Date) { return (b.getTime() - a.getTime()) / 60000 }
function flag(ok: boolean) { return ok ? '✅' : '❌' }

interface Violation { type: string; postId?: string; commentId?: string; detail: string }
const violations: Violation[] = []

function addViolation(type: string, detail: string, postId?: string, commentId?: string) {
  violations.push({ type, postId, commentId, detail })
}

async function main() {
  console.log('\n[Morning Audit — 2026-05-18 00:00~12:10 KST]')
  console.log('━'.repeat(50))

  // ── 1. 게시글 전수 조회 ────────────────────────────────
  const posts = await prisma.post.findMany({
    where: { createdAt: { gte: START_UTC, lte: END_UTC }, status: 'PUBLISHED' },
    include: { author: { select: { id: true, nickname: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })

  // CafePost.desireCategory 별도 조회
  const cafePostIds = posts.map(p => p.cafePostId).filter((id): id is string => !!id)
  const cafePosts = cafePostIds.length > 0
    ? await prisma.cafePost.findMany({
        where: { id: { in: cafePostIds } },
        select: { id: true, desireCategory: true, title: true },
      })
    : []
  const cafeMap = new Map(cafePosts.map(c => [c.id, c]))

  // ── 2. 댓글 전수 조회 ─────────────────────────────────
  const postIds = posts.map(p => p.id)
  const comments = postIds.length > 0
    ? await prisma.comment.findMany({
        where: { postId: { in: postIds }, status: 'ACTIVE' },
        include: { author: { select: { id: true, nickname: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const commentsByPost = new Map<string, typeof comments>()
  for (const c of comments) {
    if (!commentsByPost.has(c.postId)) commentsByPost.set(c.postId, [])
    commentsByPost.get(c.postId)!.push(c)
  }

  // ── 3. BotLog 집계 ────────────────────────────────────
  const botLogs = await prisma.botLog.findMany({
    where: { createdAt: { gte: START_UTC, lte: END_UTC }, action: { in: ['CONTENT_CURATE','WAVE_PROCESS','USER_POST_WAVE'] } },
    select: { botType: true, action: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // ═══════════════════════════════════════════════════════
  // A. 게시글 규칙 검증
  // ═══════════════════════════════════════════════════════

  // A-1. 슬롯별 발행 수
  console.log('\n📋 게시글 규칙')
  console.log(`총 ${posts.length}건 발행 (예상 최대 30건)`)

  const slotCounts = SLOTS.map(slot => {
    const inSlot = posts.filter(p => p.createdAt >= slot.s && p.createdAt <= slot.e)
    const ok = inSlot.length <= 5
    if (!ok) addViolation('SLOT_OVERFLOW', `${slot.kst} 슬롯 ${inSlot.length}건 (기대 ≤5)`)
    return { kst: slot.kst, count: inSlot.length, ok }
  })
  const slotLine = slotCounts.map(s => `${s.kst}(${s.count}${s.ok ? '' : '⚠️'})`).join(', ')
  console.log(`슬롯별: ${slotLine}`)

  // A-2. source 분포
  const sourceCount: Record<string, number> = {}
  for (const p of posts) {
    sourceCount[p.source] = (sourceCount[p.source] ?? 0) + 1
  }
  console.log(`source: ${Object.entries(sourceCount).map(([k,v]) => `${k}(${v})`).join(', ')}`)
  if (sourceCount['SEED'] ?? 0 > 0) {
    addViolation('SEED_POST', `source=SEED 게시글 ${sourceCount['SEED']}건 (기대=0)`)
    console.log(`  ${flag(false)} SEED 게시글 발견: ${sourceCount['SEED']}건`)
  }

  // A-3. 야간 BOT 글 (00:00~08:19 KST)
  const nightBotPosts = posts.filter(p => p.source === 'BOT' && p.createdAt < NIGHT_END)
  if (nightBotPosts.length > 0) {
    addViolation('NIGHT_BOT', `00:00~08:19 KST BOT 게시글 ${nightBotPosts.length}건`)
    console.log(`  ${flag(false)} 야간 BOT 글: ${nightBotPosts.length}건 (기대=0)`)
    for (const p of nightBotPosts) {
      console.log(`    - [${toKST(p.createdAt)} KST] "${p.title.slice(0,20)}" (${p.id})`)
    }
  } else {
    console.log(`  ${flag(true)} 야간 BOT 글: 0건`)
  }

  // A-4. 제목 길이 검증
  const titleViolations = posts.filter(p => p.source === 'BOT' && (p.title.length < TITLE_MIN || p.title.length > TITLE_MAX))
  if (titleViolations.length > 0) {
    for (const p of titleViolations) {
      addViolation('TITLE_LENGTH', `제목 ${p.title.length}자 (${TITLE_MIN}~${TITLE_MAX}자 기준): "${p.title}"`, p.id)
    }
    console.log(`  ${flag(false)} 제목 길이 위반: ${titleViolations.length}건`)
    for (const p of titleViolations) console.log(`    - [${p.title.length}자] "${p.title}"`)
  } else {
    console.log(`  ${flag(true)} 제목 길이 (${TITLE_MIN}~${TITLE_MAX}자): 전체 준수`)
  }

  // A-5. 본문 길이 검증 (BOT 게시글만)
  const contentViolations = posts.filter(p => p.source === 'BOT' && (p.content.length < CONTENT_MIN || p.content.length > CONTENT_MAX))
  if (contentViolations.length > 0) {
    for (const p of contentViolations) {
      addViolation('CONTENT_LENGTH', `본문 ${p.content.length}자 (${CONTENT_MIN}~${CONTENT_MAX}자 기준)`, p.id)
    }
    console.log(`  ${flag(false)} 본문 길이 위반: ${contentViolations.length}건`)
    for (const p of contentViolations) console.log(`    - [${p.content.length}자] "${p.title.slice(0,20)}..."`)
  } else {
    console.log(`  ${flag(true)} 본문 길이 (${CONTENT_MIN}~${CONTENT_MAX}자): 전체 준수`)
  }

  // A-6. boardType 분포
  const boardCount: Record<string, number> = {}
  for (const p of posts) boardCount[p.boardType] = (boardCount[p.boardType] ?? 0) + 1
  console.log(`boardType: ${Object.entries(boardCount).map(([k,v]) => `${k}(${v})`).join(', ')}`)

  // A-7. desireCategory HARDCAP (전일 기준 누적 — 오늘 00:00 KST부터)
  const botPosts = posts.filter(p => p.source === 'BOT')
  const desireCount: Record<string, number> = {}
  for (const p of botPosts) {
    const cafe = p.cafePostId ? cafeMap.get(p.cafePostId) : null
    const desire = cafe?.desireCategory ?? 'UNKNOWN'
    desireCount[desire] = (desireCount[desire] ?? 0) + 1
  }
  console.log(`desireCategory: ${Object.entries(desireCount).map(([k,v]) => `${k}(${v})`).join(', ')}`)
  for (const [cat, cnt] of Object.entries(desireCount)) {
    const cap = HARDCAP[cat] ?? DEFAULT_CAP
    if (cnt > cap) {
      addViolation('HARDCAP', `${cat} ${cnt}건 > 상한 ${cap}건`)
      console.log(`  ${flag(false)} HARDCAP: ${cat} ${cnt}건 / 상한 ${cap}건 초과`)
    }
  }

  // ═══════════════════════════════════════════════════════
  // B. 댓글 규칙 검증
  // ═══════════════════════════════════════════════════════
  console.log(`\n💬 댓글 규칙 (총 ${comments.length}건)`)

  const botComments = comments.filter(c => c.author?.email?.endsWith('@unao.bot'))
  const userComments = comments.filter(c => !c.author?.email?.endsWith('@unao.bot'))
  console.log(`  봇 댓글: ${botComments.length}건 / 일반 댓글: ${userComments.length}건`)

  // B-1. 봇 댓글 캡 (게시글당 ≤5)
  let capViolationCount = 0
  for (const postId of postIds) {
    const botCmts = (commentsByPost.get(postId) ?? []).filter(c => c.author?.email?.endsWith('@unao.bot'))
    if (botCmts.length > BOT_MAX_PER_POST) {
      const post = posts.find(p => p.id === postId)
      addViolation('BOT_CAP', `봇 댓글 ${botCmts.length}건 > ${BOT_MAX_PER_POST} (게시글: "${post?.title?.slice(0,20)}")`, postId)
      capViolationCount++
    }
  }
  console.log(`  ${flag(capViolationCount === 0)} 봇 댓글 캡 (≤${BOT_MAX_PER_POST}): ${capViolationCount === 0 ? '전체 준수' : `${capViolationCount}건 위반`}`)

  // B-2. 제외 페르소나 (EN1~5, N1~5 — 모든 보드 금지)
  const excludedAlwaysCmts = comments.filter(c => EXCLUDED_ALWAYS.has(c.author?.email ?? ''))
  if (excludedAlwaysCmts.length > 0) {
    for (const c of excludedAlwaysCmts) {
      addViolation('EXCLUDED_PERSONA', `제외 페르소나 댓글: ${c.author?.email}`, c.postId, c.id)
    }
    console.log(`  ${flag(false)} EN/N계열 제외 페르소나: ${excludedAlwaysCmts.length}건 위반`)
    for (const c of excludedAlwaysCmts) console.log(`    - ${c.author?.email} (postId: ${c.postId})`)
  } else {
    console.log(`  ${flag(true)} EN/N계열 제외 페르소나: 없음`)
  }

  // B-3. HUMOR_ONLY 페르소나가 HUMOR 외 보드에 댓글 달았는지
  let humorOnlyViolation = 0
  for (const c of comments) {
    if (!HUMOR_ONLY.has(c.author?.email ?? '')) continue
    const post = posts.find(p => p.id === c.postId)
    if (post && post.boardType !== 'HUMOR') {
      addViolation('HUMOR_ONLY', `HUMOR 전담 페르소나(${c.author?.email})가 ${post.boardType} 보드에 댓글`, c.postId, c.id)
      humorOnlyViolation++
    }
  }
  console.log(`  ${flag(humorOnlyViolation === 0)} HUMOR_ONLY 페르소나 보드 위반: ${humorOnlyViolation === 0 ? '없음' : `${humorOnlyViolation}건`}`)

  // B-4. 자기 글에 자기 댓글
  let selfCommentCount = 0
  for (const c of comments) {
    const post = posts.find(p => p.id === c.postId)
    if (post && c.authorId && c.authorId === post.authorId) {
      addViolation('SELF_COMMENT', `자기 글에 자기 댓글 (${c.author?.nickname})`, c.postId, c.id)
      selfCommentCount++
    }
  }
  console.log(`  ${flag(selfCommentCount === 0)} 자기 댓글: ${selfCommentCount === 0 ? '없음' : `${selfCommentCount}건`}`)

  // B-5. 중복 댓글 (같은 postId + authorId)
  const commentKey = new Map<string, number>()
  let dupCount = 0
  for (const c of comments) {
    const key = `${c.postId}__${c.authorId}`
    const prev = commentKey.get(key) ?? 0
    if (prev >= 1 && c.author?.email?.endsWith('@unao.bot')) {
      addViolation('DUPLICATE_COMMENT', `중복 댓글: ${c.author?.nickname} (${c.author?.email}) postId=${c.postId}`, c.postId, c.id)
      dupCount++
    }
    commentKey.set(key, prev + 1)
  }
  console.log(`  ${flag(dupCount === 0)} 중복 댓글: ${dupCount === 0 ? '없음' : `${dupCount}건`}`)

  // B-6. 댓글 파동 타이밍 검증 (BOT posts — CommentWave)
  console.log('\n⏱️  댓글 파동 타이밍')
  let waveOutside = 0
  const waveCountByLabel: Record<string, {ok:number, fail:number}> = {}
  WAVE_WINDOWS.forEach(w => { waveCountByLabel[w.label] = {ok:0, fail:0} })

  for (const post of botPosts) {
    const pComments = (commentsByPost.get(post.id) ?? []).filter(c => c.author?.email?.endsWith('@unao.bot') && !c.parentId)
    for (const c of pComments) {
      const elapsed = diffMin(post.createdAt, c.createdAt)
      const matched = WAVE_WINDOWS.find(w => elapsed >= w.minMin && elapsed <= w.maxMin)
      if (matched) {
        waveCountByLabel[matched.label].ok++
      } else if (elapsed >= 0 && elapsed <= 70) {
        waveOutside++
        addViolation('WAVE_TIMING', `CommentWave 타이밍 이탈: +${elapsed.toFixed(1)}분 (허용창 외)`, post.id, c.id)
      }
    }
  }

  for (const [label, cnt] of Object.entries(waveCountByLabel)) {
    const window = WAVE_WINDOWS.find(w => w.label === label)!
    console.log(`  ${label} (+${window.minMin}~${window.maxMin}분): ${cnt.ok}건 준수`)
  }
  console.log(`  타이밍 이탈: ${waveOutside}건 ${flag(waveOutside === 0)}`)

  // B-7. 회원글 UserPostWave 검증
  const userSourcePosts = posts.filter(p => p.source === 'USER')
  let userWaveOk = 0, userWaveOutside = 0
  for (const post of userSourcePosts) {
    const pBotCmts = (commentsByPost.get(post.id) ?? []).filter(c => c.author?.email?.endsWith('@unao.bot') && !c.parentId)
    for (const c of pBotCmts) {
      const elapsed = diffMin(post.createdAt, c.createdAt)
      const matched = USER_WAVE_WINDOWS.find(w => elapsed >= w.minMin && elapsed <= w.maxMin)
      if (matched) userWaveOk++
      else if (elapsed >= 0 && elapsed <= 70) {
        userWaveOutside++
        addViolation('USER_WAVE_TIMING', `UserPostWave 타이밍 이탈: +${elapsed.toFixed(1)}분`, post.id, c.id)
      }
    }
  }
  console.log(`  회원글 UserPostWave: ${userWaveOk}건 준수 / ${userWaveOutside}건 이탈 ${flag(userWaveOutside === 0)}`)

  // B-8. 대댓글 구조 확인
  const replies = comments.filter(c => !!c.parentId)
  console.log(`\n  대댓글(replies): ${replies.length}건`)

  // ═══════════════════════════════════════════════════════
  // C. BotLog 집계
  // ═══════════════════════════════════════════════════════
  if (botLogs.length > 0) {
    console.log('\n📊 BotLog')
    const logSummary: Record<string, number> = {}
    for (const l of botLogs) {
      const key = `${l.botType}/${l.action}/${l.status}`
      logSummary[key] = (logSummary[key] ?? 0) + 1
    }
    for (const [k, v] of Object.entries(logSummary)) console.log(`  ${k}: ${v}건`)
  }

  // ═══════════════════════════════════════════════════════
  // D. 이상 목록 요약
  // ═══════════════════════════════════════════════════════
  console.log('\n' + '━'.repeat(50))
  if (violations.length === 0) {
    console.log('✅ 이상 없음 — 모든 정책 준수')
  } else {
    console.log(`❌ 이상 ${violations.length}건 발견:`)
    for (const v of violations) {
      const ref = v.postId ? ` [post:${v.postId.slice(-6)}]` : ''
      console.log(`  [${v.type}]${ref} ${v.detail}`)
    }
  }
  console.log('━'.repeat(50))

  // ── JSON 저장 (Playwright용) ──────────────────────────
  const boardSlugMap: Record<string, string> = {
    STORY: 'story', HUMOR: 'humor', LIFE2: 'life2', JOB: 'job', MAGAZINE: 'magazine',
  }
  const output = {
    auditTime: new Date().toISOString(),
    range: { start: START_UTC.toISOString(), end: END_UTC.toISOString() },
    summary: {
      totalPosts: posts.length,
      totalComments: comments.length,
      botComments: botComments.length,
      replies: replies.length,
      violations: violations.length,
    },
    posts: posts.map(p => ({
      id: p.id,
      title: p.title,
      content: p.content,
      source: p.source,
      boardType: p.boardType,
      boardSlug: boardSlugMap[p.boardType] ?? p.boardType.toLowerCase(),
      authorEmail: p.author.email,
      authorNickname: p.author.nickname,
      createdAtKST: toKST(p.createdAt),
      createdAt: p.createdAt.toISOString(),
      desireCategory: p.cafePostId ? (cafeMap.get(p.cafePostId)?.desireCategory ?? null) : null,
      commentCount: p.commentCount,
      botCommentCount: (commentsByPost.get(p.id) ?? []).filter(c => c.author?.email?.endsWith('@unao.bot')).length,
      comments: (commentsByPost.get(p.id) ?? []).map(c => ({
        id: c.id,
        content: c.content,
        authorEmail: c.author?.email ?? null,
        authorNickname: c.author?.nickname ?? null,
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString(),
        elapsedMin: diffMin(p.createdAt, c.createdAt).toFixed(1),
      })),
    })),
    violations,
  }

  writeFileSync('/tmp/audit-18morning.json', JSON.stringify(output, null, 2))
  console.log('\n📁 JSON 저장: /tmp/audit-18morning.json')
}

main()
  .then(() => disconnect())
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1) })
