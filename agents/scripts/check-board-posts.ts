/**
 * 게시판별 글 현황 확인 스크립트 (삭제 전 사전 조사)
 * 실행: cd agents && npx tsx --env-file=../.env.local scripts/check-board-posts.ts
 */

import { prisma, disconnect } from '../core/db.js'

const boards = ['STORY', 'HUMOR', 'LIFE2'] as const

console.log('\n' + '═'.repeat(60))
console.log('📊 게시판별 글 현황 (PUBLISHED 기준)')
console.log('═'.repeat(60))

for (const board of boards) {
  const total = await prisma.post.count({
    where: { boardType: board, status: 'PUBLISHED' },
  })
  const bot = await prisma.post.count({
    where: { boardType: board, status: 'PUBLISHED', source: 'BOT' },
  })
  const user = await prisma.post.count({
    where: { boardType: board, status: 'PUBLISHED', source: 'USER' },
  })
  console.log(`[${board}] 전체:${total}  BOT:${bot}  USER:${user}`)
}

// 베스트 (trendingScore 상위)
const best = await prisma.post.count({
  where: { status: 'PUBLISHED', trendingScore: { gte: 50 } },
})
const bestBot = await prisma.post.count({
  where: { status: 'PUBLISHED', trendingScore: { gte: 50 }, source: 'BOT' },
})
console.log(`[BEST trendingScore≥50] 전체:${best}  BOT:${bestBot}`)

// BOT 글 샘플 (각 게시판 최근 3개씩)
console.log('\n' + '─'.repeat(60))
console.log('🤖 BOT 글 샘플 (최근 3개씩)')
console.log('─'.repeat(60))

for (const board of boards) {
  const samples = await prisma.post.findMany({
    where: { boardType: board, status: 'PUBLISHED', source: 'BOT' },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      author: { select: { nickname: true } },
    },
  })
  if (samples.length === 0) {
    console.log(`\n[${board}] 없음`)
    continue
  }
  console.log(`\n[${board}]`)
  for (const p of samples) {
    const preview = (p.content ?? '').replace(/<[^>]+>/g, '').slice(0, 80)
    console.log(`  • [${p.author?.nickname ?? '(닉네임없음)'}] ${p.title ?? '(제목없음)'}`)
    console.log(`    ${preview}...`)
    console.log(`    ${p.createdAt.toLocaleString('ko-KR')} | id:${p.id}`)
  }
}

await disconnect()
console.log('\n✅ 조회 완료 (삭제는 아직 안 됨)')
