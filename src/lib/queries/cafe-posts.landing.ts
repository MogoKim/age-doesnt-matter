import { prisma } from '@/lib/prisma'

type DesireT = 'relation' | 'health' | 'money' | 'freedom'

const DESIRE_MAP: Record<DesireT, string[]> = {
  relation: ['RELATION', 'FAMILY'],
  health:   ['HEALTH'],
  money:    ['MONEY'],
  freedom:  ['FREEDOM', 'RELATION'],
}

export async function getLandingCafePosts(t: string) {
  const categories = DESIRE_MAP[t as DesireT] ?? DESIRE_MAP.relation

  return prisma.cafePost.findMany({
    where: {
      isUsable: true,
      aiAnalyzed: true,
      desireCategory: { in: categories },
    },
    orderBy: [
      { likeCount: 'desc' },
      { commentCount: 'desc' },
    ],
    take: 10,
    select: {
      id: true,
      title: true,
      content: true,
      author: true,
      cafeName: true,
      likeCount: true,
      commentCount: true,
      postedAt: true,
    },
  })
}
