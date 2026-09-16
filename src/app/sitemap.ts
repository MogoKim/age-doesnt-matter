import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { buildGuidePath, buildPostPath, buildSeriesPath } from '@/lib/post-url'
import { prisma } from '@/lib/prisma'
import { JOB_SIDO_LIST } from '@/lib/jobs-regions'
import { EXCLUDE_GREETING } from '@/lib/greeting'
import { EXCLUDE_EVENT } from '@/lib/event-category'
import { GUIDE_SLUGS } from '@/lib/guides'
// 커뮤니티 목록 slug (SSoT: board-registry). BoardType→slug 매핑은 `buildPostPath` 안으로 옮겼다.
import { COMMUNITY_SITEMAP_SLUGS } from '@/lib/board-registry'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

const BOARD_SLUGS = COMMUNITY_SITEMAP_SLUGS

const getSitemapPosts = unstable_cache(
  () => prisma.post.findMany({
    where: {
      status: { in: ['PUBLISHED', 'SEO_ONLY'] },
      boardType: { not: 'WEEKLY' },
      AND: [EXCLUDE_GREETING, EXCLUDE_EVENT], // 가입인사·이벤트 연동글 sitemap 제외(noindex 보강)
    },
    select: { id: true, boardType: true, status: true, updatedAt: true, slug: true },
    orderBy: { createdAt: 'desc' },
    take: 20000, // 예방: eligible ~5242 > 5000 cap 으로 오래된 글 274개(2026-03~04) 누락 → 20000 상향(Google 한도 50000 이내). SEO 순위 개선 아니라 sitemap 커버리지 보정.
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
    { url: `${BASE_URL}/guide`, changeFrequency: 'weekly', priority: 0.7 },
    // 갱년기 주제 허브 — 매거진·갱년기톡의 갱년기 글을 주제별로 묶는 내부링크 축
    { url: `${BASE_URL}/topic/menopause`, changeFrequency: 'weekly', priority: 0.8 },
    // 인생 2막 허브 — 재취업·연금·생활비 자산을 검색 의도별로 묶는 내부링크 축
    { url: `${BASE_URL}/topic/second-act`, changeFrequency: 'weekly', priority: 0.8 },
    // 🔴 /best·/search 는 sitemap 에서 뺀다(2026-09-16 실측).
    //    `/best` SSR 본문 366자·콘텐츠 링크 **0개**, `/search` 424자 — 둘 다 서버 HTML 에
    //    수집할 내용이 없다. 수집기에게는 soft-404 로 보이고, 크롤 예산만 쓴다.
    //    라우트는 그대로 살아 있다(사람은 쓴다) — **수집 요청 목록에서만** 뺀다.
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/rules`, changeFrequency: 'yearly', priority: 0.2 },
    ...BOARD_SLUGS.map((boardSlug) => ({
      url: `${BASE_URL}/community/${boardSlug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    // 생활형 대표 가이드(정적 /guide) — 파일럿부터 자동 반영
    ...GUIDE_SLUGS.map((slug) => ({
      url: `${BASE_URL}${buildGuidePath(slug)}`,
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

  const postPages: MetadataRoute.Sitemap = posts
    .filter((post) => {
      // 커뮤니티 게시글(JOB·MAGAZINE 제외): slug 없으면 CUID URL → 슬러그 추가 시 308 리디렉션 유발
      const isCommunity = post.boardType !== 'JOB' && post.boardType !== 'MAGAZINE'
      return !(isCommunity && !post.slug)
    })
    .map((post) => {
      const isJob = post.boardType === 'JOB'
      const isMagazine = post.boardType === 'MAGAZINE'

      // 🔴 경로는 `buildPostPath` 하나로 만든다 — slug 가 한글이면 **percent-encode** 된다.
      //    raw non-ASCII URL 은 네이버 크롤러(Yeti)가 못 가져온다(2026-09-15 실측:
      //    같은 글이 encoded 로는 200, raw 로는 접근 실패 · sitemap 229개 중 138개가 raw).
      //    가리키는 대상은 그대로다 — `decodeURI` 하면 이전 URL 과 정확히 같다.
      //    보드별 slug 매핑도 `buildPostPath` 안에 있다(BOARD_TYPE_TO_SLUG_MAP 동일 SSoT).
      const url = `${BASE_URL}${buildPostPath({ id: post.id, boardType: post.boardType, slug: post.slug })}`

      const isSeoOnly = post.status === 'SEO_ONLY'

      // 🔴 `lastModified` 를 넣지 않는다(2026-09-16 실측).
      //    글 상세를 열 때마다 `viewCount: { increment: 1 }` 이 돌고, `Post.updatedAt` 은
      //    Prisma `@updatedAt` 이라 그 write 로 **오늘 날짜가 된다**. 그 결과 sitemap
      //    lastmod 188건 중 **175건(93%)이 최근 3일**이었다 — 실제 발행일은 4~9월에 퍼져 있고
      //    발행-수정 간격 중앙값은 61일이다. 전부 "방금 수정됨"으로 보이면 Google 은
      //    이 사이트의 lastmod 를 신호로 쓰지 않는다. **거짓 날짜보다 무날짜가 낫다.**
      //    진짜 콘텐츠 수정 시각을 따로 들고 오면(Batch B) 그때 다시 넣는다.
      return {
        url,
        changeFrequency: isJob ? 'daily' : 'weekly',
        priority: isSeoOnly ? 0.5 : isJob ? 0.9 : isMagazine ? 0.8 : 0.6,
      }
    })

  // 매거진 시리즈 허브 — 발행 3편 이상 시리즈만 포함(1~2편은 thin page → noindex·제외)
  const seriesGroups = await prisma.post.groupBy({
    by: ['seriesId'],
    where: { boardType: 'MAGAZINE', status: 'PUBLISHED', seriesId: { not: null } },
    _count: true,
  })
  const seriesHubPages: MetadataRoute.Sitemap = seriesGroups
    .filter((g) => g.seriesId != null && g._count >= 3)
    .map((g) => ({
      url: `${BASE_URL}${buildSeriesPath(String(g.seriesId))}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))

  return [...staticPages, ...postPages, ...seriesHubPages]
}
