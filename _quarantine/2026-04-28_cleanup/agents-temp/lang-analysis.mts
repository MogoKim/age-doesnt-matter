import { prisma, disconnect } from './core/db.js'

// 더 많은 wgang + dlxogns01 글 — 짧고 구어체 위주
const posts = await prisma.cafePost.findMany({
  where: {
    cafeId: { in: ['wgang', 'dlxogns01'] },
    content: { not: '' },
    // 짧은 글 위주 (실제 수다형 글)
  },
  select: { content: true, title: true, cafeId: true, boardName: true },
  orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }],
  take: 40,
})

console.log(`조회 결과: ${posts.length}개`)
for (const p of posts) {
  // HTML 태그 제거 후 출력
  const clean = p.content
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
  if (clean.length < 20) continue
  console.log(`\n[${p.cafeId}/${p.boardName ?? ''}] ${p.title}`)
  console.log(clean)
}
await disconnect()
