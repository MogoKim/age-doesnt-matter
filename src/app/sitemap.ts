import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://www.age-doesnt-matter.com'

const BOARD_SLUGS = ['stories', 'humor', 'life2', 'magazine', 'jobs']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/jobs`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/magazine`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/best`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/search`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/rules`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/faq`, changeFrequency: 'monthly', priority: 0.3 },
    ...BOARD_SLUGS.map((slug) => ({
      url: `${BASE_URL}/community/${slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]

  // 게시글 동적 페이지
  const posts = await prisma.post.findMany({
    where: { status: { in: ['PUBLISHED', 'SEO_ONLY'] } },
    select: { id: true, boardType: true, status: true, updatedAt: true, slug: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  const BOARD_TYPE_TO_SLUG: Record<string, string> = {
    STORY: 'stories',
    HUMOR: 'humor',
    MAGAZINE: 'magazine',
    JOB: 'jobs',
    WEEKLY: 'weekly',
    LIFE2: 'life2',
  }

  const postPages: MetadataRoute.Sitemap = posts.map((post) => {
    const isJob = post.boardType === 'JOB'
    const isMagazine = post.boardType === 'MAGAZINE'
    const slug = BOARD_TYPE_TO_SLUG[post.boardType]

    let url: string
    if (isJob) {
      url = `${BASE_URL}/jobs/${post.id}`
    } else if (isMagazine) {
      url = post.slug
        ? `${BASE_URL}/magazine/${post.slug}`
        : `${BASE_URL}/magazine/${post.id}`
    } else {
      const postSlug = post.slug ?? post.id
      url = `${BASE_URL}/community/${slug}/${postSlug}`
    }

    const isSeoOnly = post.status === 'SEO_ONLY'

    return {
      url,
      lastModified: post.updatedAt,
      changeFrequency: isJob ? 'daily' : 'weekly',
      priority: isSeoOnly ? 0.5 : isJob ? 0.9 : isMagazine ? 0.8 : 0.6,
    }
  })

  return [...staticPages, ...postPages]
}
