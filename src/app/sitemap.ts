import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { JOB_SIDO_LIST } from '@/lib/jobs-regions'
import { EXCLUDE_GREETING } from '@/lib/greeting'
import { GUIDE_SLUGS } from '@/lib/guides'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

const BOARD_SLUGS = ['stories', 'humor', 'life2']

const getSitemapPosts = unstable_cache(
  () => prisma.post.findMany({
    where: {
      status: { in: ['PUBLISHED', 'SEO_ONLY'] },
      boardType: { not: 'WEEKLY' },
      ...EXCLUDE_GREETING, // 가입인사 글 sitemap 제외(noindex 보강)
    },
    select: { id: true, boardType: true, status: true, updatedAt: true, slug: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  }),
  ['sitemap-posts'],
  { revalidate: 3600, tags: ['sitemap-posts'] },
)

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
    ...BOARD_SLUGS.map((slug) => ({
      url: `${BASE_URL}/community/${slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    // 생활형 대표 가이드(정적 /guide) — 파일럿부터 자동 반영
    ...GUIDE_SLUGS.map((slug) => ({
      url: `${BASE_URL}/guide/${encodeURI(slug)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    // 지역별 일자리 랜딩페이지 (롱테일 SEO)
    ...JOB_SIDO_LIST.map((sido) => ({
      url: `${BASE_URL}/jobs/region/${encodeURIComponent(sido)}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]

  // 게시글 동적 페이지
  // WEEKLY 제외: /community/weekly 라우트 없음 (LIFE2로 대체된 숨겨진 게시판) → 포함 시 404 대량 발생
  const posts = await getSitemapPosts()

  const BOARD_TYPE_TO_SLUG: Record<string, string> = {
    STORY: 'stories',
    HUMOR: 'humor',
    MAGAZINE: 'magazine',
    JOB: 'jobs',
    LIFE2: 'life2',
  }

  const postPages: MetadataRoute.Sitemap = posts
    .filter((post) => {
      // 커뮤니티 게시글(JOB·MAGAZINE 제외): slug 없으면 CUID URL → 슬러그 추가 시 308 리디렉션 유발
      const isCommunity = post.boardType !== 'JOB' && post.boardType !== 'MAGAZINE'
      return !(isCommunity && !post.slug)
    })
    .map((post) => {
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
        url = `${BASE_URL}/community/${slug}/${post.slug!}`
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
