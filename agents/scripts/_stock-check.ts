// LOCAL ONLY — 재고 현황 + keyword overlap 진단 (1회성)
import 'dotenv/config'
import { prisma, disconnect } from '../core/db.js'

async function main() {
  // 1. 실제 큐레이션 가능 재고 (usedAt=null 필터)
  const stock = await prisma.cafePost.groupBy({
    by: ['desireCategory'],
    where: { isUsable: true, usedAt: null, isPopular: false },
    _count: true,
    orderBy: { _count: { desireCategory: 'desc' } },
  })
  const total = stock.reduce((s, r) => s + r._count, 0)
  console.log('\n[실제 큐레이션 가능 재고 — usedAt=null 필터]', total, '건')
  for (const r of stock) {
    const pct = ((r._count / total) * 100).toFixed(1)
    console.log(' ', (r.desireCategory ?? 'null').padEnd(14), r._count + '건 (' + pct + '%)')
  }

  // 2. CSV에서 보이는 전체 vs 실제 남은 재고
  const allCount = await prisma.cafePost.count({ where: { isUsable: true } })
  console.log('\n[CSV isUsable=true 전체]', allCount, '건')
  console.log('[실제 남은 재고]', total, '건 (' + ((total / allCount) * 100).toFixed(1) + '% 남음)')
  console.log('[이미 소비된 글]', allCount - total, '건')

  // 3. 오늘 발행글
  const todayStart = new Date('2026-05-19T15:00:00.000Z') // 2026-05-20 00:00 KST
  const todayPosts = await prisma.post.findMany({
    where: { source: 'BOT', createdAt: { gte: todayStart } },
    select: { title: true, boardType: true },
  })
  console.log('\n[오늘 발행글]', todayPosts.length, '건')
  for (const p of todayPosts)
    console.log(' [' + p.boardType + ']', p.title.slice(0, 45))

  // 4. 명사 빈도 — OVERLAP_STOPWORDS 적용 후 시뮬레이션 (content-curator.ts 실제 로직)
  const OVERLAP_STOPWORDS = new Set([
    '해요', '이요', '에요', '어요', '아요', '해서', '하고', '해도',
    '가요', '이야', '거야', '줘요', '봐요', '되요', '는데', '인데',
    '같아', '같이', '있어', '없어', '싶어', '했어', '봤어', '갔어',
    '에서', '으로', '에게', '이나', '거나', '에도', '이도', '이고',
    '이게', '그게', '저게', '이건', '그건', '저건',
    '많이', '너무', '정말', '진짜', '아직', '이미', '그냥', '항상',
    '오늘', '내일', '어제', '이번', '지난', '다음', '데이',
  ])
  const allTitles = todayPosts.map(p => p.title).join(' ')
  const nounMap = new Map<string, number>()
  for (const p of todayPosts) {
    const nouns = (p.title.match(/[가-힣]{2,}/g) ?? [])
      .filter(n => !OVERLAP_STOPWORDS.has(n))
    for (const n of nouns) {
      const cnt = (allTitles.match(new RegExp(n, 'g')) ?? []).length
      nounMap.set(n, Math.max(nounMap.get(n) ?? 0, cnt))
    }
  }
  const top = [...nounMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  console.log('\n[당일 발행글 명사 빈도 top15 — stopword 필터 적용 후, >=3이면 스킵]')
  for (const [n, c] of top)
    console.log(' ', n.padEnd(8), c + '회', c >= 3 ? '<-- 스킵 트리거' : '')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(disconnect)
