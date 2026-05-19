// LOCAL ONLY — 웃음방 발행 현황 진단
import 'dotenv/config'
import { prisma } from '../core/db.js'

// 1. HUMOR 7일 발행 현황
const humorPosts = await prisma.post.findMany({
  where: { boardType: 'HUMOR', createdAt: { gte: new Date(Date.now() - 7*24*60*60*1000) } },
  select: { title: true, source: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
})
console.log('[HUMOR 7일 발행]', humorPosts.length + '건')
for (const p of humorPosts) console.log(' ', p.source, p.title.slice(0,40))

// 2. 미사용 재고 desireCategory 분포
const stock = await prisma.cafePost.groupBy({
  by: ['desireCategory'],
  where: { isUsable: true, usedAt: null },
  _count: true,
  orderBy: { _count: { desireCategory: 'desc' } },
})
console.log('\n[미사용 재고 desireCategory 전체]')
for (const r of stock) console.log(' ', (r.desireCategory ?? 'null').padEnd(12), r._count + '건')

// 3. HUMOR/ENTERTAIN killerScore 분포
const [humorTotal, humor55, entTotal, ent55] = await Promise.all([
  prisma.cafePost.count({ where: { desireCategory: 'HUMOR', isUsable: true, usedAt: null } }),
  prisma.cafePost.count({ where: { desireCategory: 'HUMOR', isUsable: true, usedAt: null, killerScore: { gte: 55 } } }),
  prisma.cafePost.count({ where: { desireCategory: 'ENTERTAIN', isUsable: true, usedAt: null } }),
  prisma.cafePost.count({ where: { desireCategory: 'ENTERTAIN', isUsable: true, usedAt: null, killerScore: { gte: 55 } } }),
])
console.log('\n[HUMOR/ENTERTAIN killerScore]')
console.log('HUMOR   : 전체', humorTotal, '건 | >=55:', humor55, '건')
console.log('ENTERTAIN: 전체', entTotal, '건 | >=55:', ent55, '건')

// 4. HUMOR 재고 샘플 (killerScore 높은 순)
const humorSample = await prisma.cafePost.findMany({
  where: { desireCategory: 'HUMOR', isUsable: true, usedAt: null },
  orderBy: { killerScore: 'desc' },
  take: 5,
  select: { title: true, killerScore: true, cafeName: true },
})
console.log('\n[HUMOR 재고 샘플 (killerScore 순)]')
for (const p of humorSample) console.log(' ', p.killerScore, p.title.slice(0,40), '(' + p.cafeName + ')')

await prisma.$disconnect()
