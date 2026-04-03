/**
 * 오늘 봇 게시글 조회
 * Usage: npx tsx scripts/check-bot-posts.ts
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 오늘 봇 게시글
  const botPosts = await prisma.post.findMany({
    where: {
      source: 'BOT',
      createdAt: { gte: today },
    },
    select: {
      id: true,
      title: true,
      boardType: true,
      status: true,
      createdAt: true,
      author: { select: { nickname: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`\n📊 오늘 봇 게시글: ${botPosts.length}건\n`)

  if (botPosts.length === 0) {
    console.log('❌ 오늘 봇이 작성한 게시글이 없습니다.')
  } else {
    const byBoard: Record<string, number> = {}
    for (const p of botPosts) {
      byBoard[p.boardType] = (byBoard[p.boardType] ?? 0) + 1
      console.log(`  [${p.boardType}] ${p.status} | ${p.author?.nickname ?? '?'} | ${p.title} | ${p.createdAt.toLocaleString('ko-KR')}`)
    }
    console.log(`\n📋 게시판별: ${Object.entries(byBoard).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  }

  // 전체 봇 게시글 수
  const totalBot = await prisma.post.count({ where: { source: 'BOT' } })
  const totalUser = await prisma.post.count({ where: { source: 'USER' } })
  console.log(`\n📈 전체: 봇=${totalBot}건, 유저=${totalUser}건, UGC 비율=${totalUser > 0 ? Math.round(totalUser / (totalBot + totalUser) * 100) : 0}%`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('❌ 에러:', e)
  process.exit(1)
})
