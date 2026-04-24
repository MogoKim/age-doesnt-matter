/**
 * 게시판 AI스러운 글 감사 및 HIDDEN 처리 스크립트
 *
 * 실행 방법:
 *   cd agents
 *   npx tsx --env-file=../.env.local scripts/audit-and-hide-posts.ts           # 드라이런 (변경 없음)
 *   npx tsx --env-file=../.env.local scripts/audit-and-hide-posts.ts --execute  # 실제 HIDDEN 처리
 *
 * 삭제 기준:
 *   Rule 1 — 같은 날 동일 주제 중복 BOT 글 (최신 1개 보존, 나머지 HIDDEN)
 *   Rule 2 — HUMOR 전체 BOT 글 Haiku 평가 (점수 ≥ 7 → HIDDEN)
 *   Rule 3 — STORY 오늘치 + LIFE2 전체 Haiku 평가 (점수 ≥ 7 → HIDDEN)
 */

import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'

const EXECUTE = process.argv.includes('--execute')
const AI_THRESHOLD = 7 // 이 점수 이상이면 HIDDEN 후보

interface HideCandidate {
  id: string
  boardType: string
  title: string
  nickname: string
  createdAt: Date
  rule: string
  aiScore?: number
  reason?: string
}

// ── 유틸 ──────────────────────────────────────────────────────────────────

/** HTML 태그 제거 후 plain text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/** KST 기준 오늘 0시~23시59분59초 범위 */
function getTodayKSTRange(): { start: Date; end: Date } {
  const now = new Date()
  // KST = UTC+9
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)
  const kstMidnight = new Date(kstNow)
  kstMidnight.setUTCHours(0, 0, 0, 0)
  const start = new Date(kstMidnight.getTime() - kstOffset)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { start, end }
}

/** 제목에서 2글자 이상 한글 명사 추출 (조사/어미 제거용 간단 필터) */
function extractNouns(title: string): string[] {
  // 2글자 이상 한글 단어 추출, 불용어 제외
  const stopWords = new Set([
    '이거', '그거', '저거', '이게', '그게', '저게', '이건', '그건', '저건',
    '하고', '하는', '이랑', '거랑', '한다', '있는', '없는', '이런', '그런', '저런',
    '봤는데', '했는데', '인데', '이고', '이며', '에서', '으로', '부터', '까지',
    '같은', '같아', '같고', '다들', '다른', '이거나', '아니면',
    '진짜', '정말', '너무', '매우', '아주', '조금', '좀', '항상', '자꾸',
    '완전', '엄청', '엄청나', '어떤', '어느', '무슨',
  ])
  const matches = title.match(/[가-힣]{2,}/g) ?? []
  return matches.filter(w => !stopWords.has(w))
}

/** 두 명사 집합 간 겹치는 단어 수 */
function overlapCount(a: string[], b: string[]): number {
  const setA = new Set(a)
  return b.filter(w => setA.has(w)).length
}

// ── Rule 1: 동일 주제 중복 탐지 ───────────────────────────────────────────

interface PostMinimal {
  id: string
  title: string
  boardType: string
  createdAt: Date
  author: { nickname: string } | null
}

function detectDuplicates(posts: PostMinimal[]): HideCandidate[] {
  const candidates: HideCandidate[] = []
  const processed = new Set<string>()

  for (let i = 0; i < posts.length; i++) {
    if (processed.has(posts[i].id)) continue
    const nounsI = extractNouns(posts[i].title)

    const group: PostMinimal[] = [posts[i]]
    for (let j = i + 1; j < posts.length; j++) {
      if (processed.has(posts[j].id)) continue
      // 같은 게시판 + 같은 날 + 명사 2개 이상 겹침
      if (
        posts[i].boardType === posts[j].boardType &&
        overlapCount(nounsI, extractNouns(posts[j].title)) >= 2
      ) {
        group.push(posts[j])
      }
    }

    if (group.length >= 2) {
      // 최신 1개 보존, 나머지 HIDDEN 후보
      group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      const [keep, ...rest] = group
      processed.add(keep.id)
      for (const p of rest) {
        processed.add(p.id)
        candidates.push({
          id: p.id,
          boardType: p.boardType,
          title: p.title,
          nickname: p.author?.nickname ?? '(없음)',
          createdAt: p.createdAt,
          rule: `Rule1:중복(${group.length}개 중 "${keep.title.slice(0, 20)}..." 보존)`,
        })
      }
    }
  }

  return candidates
}

// ── Rule 2~3: Claude Haiku AI스러움 평가 ─────────────────────────────────

const client = new Anthropic()

async function evaluateAIScore(
  post: { title: string; content: string },
): Promise<{ score: number; reason: string }> {
  const plainContent = stripHtml(post.content).slice(0, 500)
  const prompt = `당신은 한국 50~60대 커뮤니티 게시글 감수자입니다.

아래 글이 실제 50~60대 한국인이 자연스럽게 쓴 글인지, 아니면 AI가 자동 생성한 것처럼 어색한 글인지 평가해주세요.

제목: ${post.title}
내용: ${plainContent}

평가 기준:
- 1점: 완전히 자연스러운 실제 사람 글 (개인 경험, 자연스러운 말실수, 진짜 감정)
- 5점: 애매함 (사람 같기도 하고 AI 같기도 함)
- 10점: 확실히 AI 생성 (너무 정형화된 구조, 과도하게 완벽한 문체, 실제 감정 없음)

JSON 형식으로만 답하세요:
{"score": 숫자, "reason": "한 줄 이유"}`

  const res = await client.messages.create({
    model: process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
  try {
    const parsed = JSON.parse(text.match(/\{.*\}/s)?.[0] ?? '{}')
    return {
      score: Number(parsed.score) || 5,
      reason: String(parsed.reason || ''),
    }
  } catch {
    return { score: 5, reason: '파싱 실패' }
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────

const { start: todayStart, end: todayEnd } = getTodayKSTRange()

console.log('\n' + '═'.repeat(65))
console.log(`🔍 게시판 AI스러운 글 감사 스크립트`)
console.log(`   모드: ${EXECUTE ? '🔴 EXECUTE (실제 HIDDEN 처리)' : '🟡 DRY-RUN (변경 없음)'}`)
console.log(`   오늘 KST 범위: ${todayStart.toISOString()} ~ ${todayEnd.toISOString()}`)
console.log('═'.repeat(65))

// ── 1. 오늘 전체 BOT 글 조회 (Rule 1용) ──────────────────────────────────
const todayBotPosts = await prisma.post.findMany({
  where: {
    boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
    source: 'BOT',
    status: 'PUBLISHED',
    createdAt: { gte: todayStart, lte: todayEnd },
  },
  select: { id: true, title: true, boardType: true, createdAt: true, author: { select: { nickname: true } } },
  orderBy: { createdAt: 'desc' },
})

console.log(`\n📋 오늘 BOT 글: ${todayBotPosts.length}개`)

// ── Rule 1: 중복 탐지 ────────────────────────────────────────────────────
console.log('\n[Rule 1] 동일 주제 중복 탐지...')
const duplicateCandidates = detectDuplicates(todayBotPosts)
console.log(`  → 중복 후보: ${duplicateCandidates.length}개`)

// 중복 후보 ID Set (Rule 2~3에서 이미 처리된 것은 제외하기 위함)
const ruleOneDedupIds = new Set(duplicateCandidates.map(c => c.id))

// ── 2. HUMOR 전체 BOT 글 조회 (Rule 2용) ─────────────────────────────────
const humorBotPosts = await prisma.post.findMany({
  where: { boardType: 'HUMOR', source: 'BOT', status: 'PUBLISHED' },
  select: { id: true, title: true, content: true, boardType: true, createdAt: true, author: { select: { nickname: true } } },
  orderBy: { createdAt: 'desc' },
})

// ── 3. STORY 오늘치 + LIFE2 전체 (Rule 3용) ──────────────────────────────
const rule3Posts = await prisma.post.findMany({
  where: {
    OR: [
      { boardType: 'STORY', source: 'BOT', status: 'PUBLISHED', createdAt: { gte: todayStart, lte: todayEnd } },
      { boardType: 'LIFE2', source: 'BOT', status: 'PUBLISHED' },
    ],
  },
  select: { id: true, title: true, content: true, boardType: true, createdAt: true, author: { select: { nickname: true } } },
  orderBy: { createdAt: 'desc' },
})

// ── Rule 2: HUMOR Haiku 평가 ─────────────────────────────────────────────
console.log(`\n[Rule 2] HUMOR BOT 글 ${humorBotPosts.length}개 AI 평가 중...`)
const rule2Candidates: HideCandidate[] = []

for (const p of humorBotPosts) {
  if (ruleOneDedupIds.has(p.id)) continue // Rule 1 이미 처리
  process.stdout.write('.')
  const { score, reason } = await evaluateAIScore({ title: p.title, content: p.content })
  if (score >= AI_THRESHOLD) {
    rule2Candidates.push({
      id: p.id,
      boardType: p.boardType,
      title: p.title,
      nickname: p.author?.nickname ?? '(없음)',
      createdAt: p.createdAt,
      rule: `Rule2:HUMOR_AI`,
      aiScore: score,
      reason,
    })
  }
}
console.log(`\n  → HUMOR AI 후보: ${rule2Candidates.length}개`)

// ── Rule 3: STORY 오늘치 + LIFE2 Haiku 평가 ─────────────────────────────
const rule3PostsFiltered = rule3Posts.filter(
  (p: { id: string }) => !ruleOneDedupIds.has(p.id) && !rule2Candidates.some(c => c.id === p.id)
)
console.log(`\n[Rule 3] STORY 오늘치 + LIFE2 ${rule3PostsFiltered.length}개 AI 평가 중...`)
const rule3Candidates: HideCandidate[] = []

for (const p of rule3PostsFiltered) {
  process.stdout.write('.')
  const { score, reason } = await evaluateAIScore({ title: p.title, content: p.content })
  if (score >= AI_THRESHOLD) {
    rule3Candidates.push({
      id: p.id,
      boardType: p.boardType,
      title: p.title,
      nickname: p.author?.nickname ?? '(없음)',
      createdAt: p.createdAt,
      rule: `Rule3:${p.boardType}_AI`,
      aiScore: score,
      reason,
    })
  }
}
console.log(`\n  → STORY/LIFE2 AI 후보: ${rule3Candidates.length}개`)

// ── 최종 후보 통합 ────────────────────────────────────────────────────────
const allCandidates: HideCandidate[] = [
  ...duplicateCandidates,
  ...rule2Candidates,
  ...rule3Candidates,
]

// 중복 id 제거 (Rule 1 중복과 Rule 2~3이 겹칠 경우)
const seen = new Set<string>()
const uniqueCandidates = allCandidates.filter(c => {
  if (seen.has(c.id)) return false
  seen.add(c.id)
  return true
})

// ── 결과 출력 ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65))
console.log(`📊 HIDDEN 후보 총 ${uniqueCandidates.length}개`)
console.log('─'.repeat(65))

const byBoard: Record<string, HideCandidate[]> = {}
for (const c of uniqueCandidates) {
  ;(byBoard[c.boardType] ??= []).push(c)
}

for (const [board, list] of Object.entries(byBoard)) {
  console.log(`\n[${board}] ${list.length}개`)
  for (const c of list) {
    const scoreStr = c.aiScore != null ? ` (AI:${c.aiScore}점)` : ''
    console.log(`  • [${c.nickname}] ${c.title.slice(0, 40)}`)
    console.log(`    ${c.rule}${scoreStr}`)
    if (c.reason) console.log(`    💬 ${c.reason}`)
    console.log(`    ${c.createdAt.toLocaleString('ko-KR')} | id:${c.id}`)
  }
}

// ── USER 글 포함 여부 최종 안전 확인 ─────────────────────────────────────
if (uniqueCandidates.length > 0) {
  const candidateIds = uniqueCandidates.map(c => c.id)
  const userInCandidates = await prisma.post.count({
    where: { id: { in: candidateIds }, source: 'USER' },
  })
  if (userInCandidates > 0) {
    console.log(`\n🚨 경고: USER 글 ${userInCandidates}개가 후보에 포함됨! 처리 중단.`)
    await disconnect()
    process.exit(1)
  }
  console.log('\n✅ 안전 확인: USER 글 포함 없음')
}

// ── HIDDEN 처리 (--execute 시만) ─────────────────────────────────────────
if (EXECUTE && uniqueCandidates.length > 0) {
  console.log('\n🔴 HIDDEN 처리 시작...')
  let done = 0
  for (const c of uniqueCandidates) {
    await prisma.post.update({
      where: { id: c.id },
      data: { status: 'HIDDEN' },
    })
    done++
    process.stdout.write(`\r  처리 중: ${done}/${uniqueCandidates.length}`)
  }
  console.log(`\n✅ ${done}개 HIDDEN 처리 완료`)

  // 처리 후 잔여 글 수 보고
  console.log('\n📊 처리 후 잔여 PUBLISHED 글 수:')
  for (const board of ['STORY', 'HUMOR', 'LIFE2'] as const) {
    const remaining = await prisma.post.count({ where: { boardType: board, status: 'PUBLISHED' } })
    const userRemaining = await prisma.post.count({ where: { boardType: board, status: 'PUBLISHED', source: 'USER' } })
    console.log(`  [${board}] ${remaining}개 (USER: ${userRemaining}개)`)
  }
} else if (!EXECUTE) {
  console.log('\n💡 실제 처리하려면 --execute 플래그 추가:')
  console.log('   npx tsx --env-file=../.env.local scripts/audit-and-hide-posts.ts --execute')
}

await disconnect()
console.log('\n✅ 완료\n')
