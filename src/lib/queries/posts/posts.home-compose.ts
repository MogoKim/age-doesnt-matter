import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { PostSummary } from '@/types/api'

type SectionKey = 'TRENDING' | 'STORIES' | 'HUMOR'
import { postSelect, toPostSummary } from './posts.base'
import { getTrendingQuotaPosts } from './posts.trending'
import { getHomeBoardHotPostsRaw } from './posts.home'

export interface HomeSectionsResult {
  trending: PostSummary[]
  stories: PostSummary[]
  humor: PostSummary[]
}

interface RawOverride {
  postId: string
  section: SectionKey
  action: 'PIN' | 'HIDE'
  position: number | null
}

function applySectionOverrides(
  autoCandidates: PostSummary[],
  sectionOverrides: RawOverride[],
  pinPostMap: Map<string, PostSummary>,
  globallyShownIds: Set<string>,
  maxCount: number,
): PostSummary[] {
  const hideIds = new Set(
    sectionOverrides.filter(o => o.action === 'HIDE').map(o => o.postId),
  )

  const pinItems = sectionOverrides
    .filter(o => o.action === 'PIN' && !hideIds.has(o.postId))
    .sort((a, b) => {
      if (a.position === null && b.position === null) return 0
      if (a.position === null) return 1
      if (b.position === null) return -1
      return a.position - b.position
    })
    .map(o => pinPostMap.get(o.postId))
    .filter((p): p is PostSummary => p !== undefined)

  const pinIds = new Set(pinItems.map(p => p.id))

  const filteredAuto = autoCandidates.filter(
    p => !hideIds.has(p.id) && !pinIds.has(p.id) && !globallyShownIds.has(p.id),
  )

  return [...pinItems, ...filteredAuto].slice(0, maxCount)
}

async function _composeHomeSections(): Promise<HomeSectionsResult> {
  const now = new Date()

  // 1. Active overrides — lightweight select (no JOIN)
  const allOverrides = (await prisma.homeCurationOverride.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { postId: true, section: true, action: true, position: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
  })) as RawOverride[]

  // 2. Fetch PIN post data + auto candidates in parallel
  const pinPostIds = [
    ...new Set(allOverrides.filter(o => o.action === 'PIN').map(o => o.postId)),
  ]

  const [pinPostsRaw, autoTrending, autoStories, autoHumor] = await Promise.all([
    pinPostIds.length > 0
      ? prisma.post.findMany({
          where: { id: { in: pinPostIds }, status: 'PUBLISHED' },
          select: postSelect,
        })
      : Promise.resolve([]),
    getTrendingQuotaPosts(),
    getHomeBoardHotPostsRaw('STORY', 20),
    getHomeBoardHotPostsRaw('HUMOR', 15),
  ])

  const pinPostMap = new Map(pinPostsRaw.map(p => [p.id, toPostSummary(p)]))

  const bySection = (section: SectionKey): RawOverride[] =>
    allOverrides.filter(o => o.section === section)

  // 3. TRENDING (no global exclusion — this defines the baseline)
  const trending = applySectionOverrides(
    autoTrending,
    bySection('TRENDING'),
    pinPostMap,
    new Set(),
    10,
  )

  // 4. globallyShownIds = final TRENDING result
  const globallyShownIds = new Set(trending.map(p => p.id))

  // 5. STORIES (exclude globally shown)
  const stories = applySectionOverrides(
    autoStories,
    bySection('STORIES'),
    pinPostMap,
    globallyShownIds,
    5,
  )
  stories.forEach(p => globallyShownIds.add(p.id))

  // 6. HUMOR (exclude globally shown)
  const humor = applySectionOverrides(
    autoHumor,
    bySection('HUMOR'),
    pinPostMap,
    globallyShownIds,
    5,
  )

  return { trending, stories, humor }
}

export const getCachedHomeSections = unstable_cache(
  _composeHomeSections,
  ['home-sections-composed'],
  {
    revalidate: 60,
    tags: ['home-trending', 'home-stories', 'home-humor', 'home-board-hot', 'home-curation'],
  },
)

export async function composeHomeSectionsWithDiagnostics(): Promise<
  HomeSectionsResult & {
    diagnostics: {
      trendingCount: number
      storiesCount: number
      humorCount: number
      generatedAt: string
    }
  }
> {
  const result = await _composeHomeSections()
  return {
    ...result,
    diagnostics: {
      trendingCount: result.trending.length,
      storiesCount: result.stories.length,
      humorCount: result.humor.length,
      generatedAt: new Date().toISOString(),
    },
  }
}
