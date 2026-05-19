// LOCAL ONLY — 웃음방 재고 부재 원인 진단
import 'dotenv/config'
import { prisma } from '../core/db.js'

// 1. 전체 cafePost에서 desireCategory=HUMOR 건수 (usedAt 불문)
const humorAll = await prisma.cafePost.count({ where: { desireCategory: 'HUMOR' } })
const entertainAll = await prisma.cafePost.count({ where: { desireCategory: 'ENTERTAIN' } })
console.log('[전체 수집 HUMOR]', humorAll, '건 | ENTERTAIN:', entertainAll, '건')

// 2. null인 564건 중 웃음/유머 관련 제목 샘플
const nullSample = await prisma.cafePost.findMany({
  where: {
    desireCategory: null,
    isUsable: true,
    usedAt: null,
    OR: [
      { title: { contains: '웃', mode: 'insensitive' } },
      { title: { contains: '유머', mode: 'insensitive' } },
      { title: { contains: '황당', mode: 'insensitive' } },
      { title: { contains: '재미', mode: 'insensitive' } },
      { title: { contains: '드라마', mode: 'insensitive' } },
      { title: { contains: '웃긴', mode: 'insensitive' } },
    ],
  },
  select: { title: true, killerScore: true, cafeName: true, desireCategory: true },
  orderBy: { killerScore: 'desc' },
  take: 10,
})
console.log('\n[null 재고 중 유머 관련 제목 샘플]', nullSample.length + '건')
for (const p of nullSample) console.log(' [' + p.killerScore + '] ' + p.title.slice(0,40) + ' (' + p.cafeName + ')')

// 3. 오늘 크롤링된 글 cafeName 분포 확인
const since24h = new Date(Date.now() - 24*60*60*1000)
const cafeNames = await prisma.cafePost.groupBy({
  by: ['cafeName'],
  where: { crawledAt: { gte: since24h } },
  _count: true,
})
console.log('\n[오늘 크롤링 카페별]')
for (const c of cafeNames) console.log(' ', c.cafeName + ':', c._count + '건')

// 4. desireCategory 자동 분류는 어디서? isPopular 여부와 desireCategory 관계
const withCategory = await prisma.cafePost.count({ where: { desireCategory: { not: null } } })
const total = await prisma.cafePost.count()
console.log('\n[전체 desireCategory 분류율]', withCategory + '/' + total, '(' + ((withCategory/total)*100).toFixed(1) + '%)')

await prisma.$disconnect()
