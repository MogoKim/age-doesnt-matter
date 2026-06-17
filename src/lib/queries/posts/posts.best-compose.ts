import { prisma } from '@/lib/prisma'
import type { BoardType, PromotionLevel } from '@/generated/prisma/client'
import type { PostSummary } from '@/types/api'
import { postSelect, toPostSummary, type SearchField } from './posts.base'
import { getAccumulatedHotPosts, getHallOfFamePosts } from './posts.trending'
import { EXCLUDE_GREETING } from '@/lib/greeting'

/**
 * 베스트 페이지 큐레이션 컴포즈.
 * 자동 후보(뜨는이야기=hotPromotedAt / 명예의전당=HALL_OF_FAME) 위에
 * 어드민 오버라이드(HomeCurationOverride section=BEST_HOT/BEST_FAME)를 적용:
 *   - HIDE: 결과에서 제외(전 페이지)
 *   - PIN : 1페이지 최상단에 position 순으로 강제 노출(자동 자격 무관, id로 직접 fetch)
 * 검색어(q)가 있으면 큐레이션 미적용 — 원본 결과 그대로.
 */

const COMMUNITY_BOARDS = ['STORY', 'HUMOR', 'LIFE2'] as BoardType[]
// 뜨는이야기 select은 hotPromotedAt 포함(표시용). toPostSummary가 optional 처리.
const hotSelect = { ...postSelect, hotPromotedAt: true } as const

type BestSection = 'BEST_HOT' | 'BEST_FAME'
interface BestOverride { postId: string; action: 'PIN' | 'HIDE'; position: number | null }
export interface BestComposeOptions { skip?: number; limit?: number; q?: string; sf?: SearchField }

interface ComposeDeps {
  rawSearch: (o: BestComposeOptions) => Promise<{ posts: PostSummary[]; total: number }>
  fetchPins: (ids: string[]) => Promise<PostSummary[]>
  countAuto: (excludeIds: string[]) => Promise<number>
  fetchAuto: (excludeIds: string[], skip: number, take: number) => Promise<PostSummary[]>
}

async function fetchBestOverrides(section: BestSection): Promise<BestOverride[]> {
  const now = new Date()
  try {
    return (await prisma.homeCurationOverride.findMany({
      where: { section, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { postId: true, action: true, position: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    })) as BestOverride[]
  } catch {
    // 마이그레이션(enum BEST_HOT/BEST_FAME) 미적용 시 enum 에러 → 큐레이션 없이 자동 후보로 폴백.
    // 배포 순서 무관하게 /best가 깨지지 않도록 방어.
    return []
  }
}

async function composeWithOverrides(
  section: BestSection,
  opts: BestComposeOptions,
  deps: ComposeDeps,
): Promise<{ posts: PostSummary[]; total: number }> {
  const { skip = 0, limit = 12, q, sf } = opts
  if (q) return deps.rawSearch({ skip, limit, q, sf }) // 검색 → 큐레이션 미적용

  const overrides = await fetchBestOverrides(section)
  const hideIds = new Set(overrides.filter(o => o.action === 'HIDE').map(o => o.postId))
  const pinIds = overrides
    .filter(o => o.action === 'PIN' && !hideIds.has(o.postId))
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
    .map(o => o.postId)
  const excluded = [...hideIds, ...pinIds]

  // PIN 글(1페이지 상단) — id 순서 보존
  const pinSummaries = pinIds.length ? await deps.fetchPins(pinIds) : []
  const pinMap = new Map(pinSummaries.map(p => [p.id, p]))
  const orderedPins = pinIds.map(id => pinMap.get(id)).filter((p): p is PostSummary => !!p)
  const pinCount = orderedPins.length

  const autoTotal = await deps.countAuto(excluded)
  const total = pinCount + autoTotal

  // 가상 리스트 [pins..., auto...]에서 [skip, skip+limit) 윈도우 추출
  const pinsPart = orderedPins.slice(Math.min(skip, pinCount), Math.min(pinCount, skip + limit))
  const autoStart = Math.max(0, skip - pinCount)
  const autoTake = limit - pinsPart.length
  const autoPart = autoTake > 0 ? await deps.fetchAuto(excluded, autoStart, autoTake) : []

  return { posts: [...pinsPart, ...autoPart], total }
}

function withExclude(base: Record<string, unknown>, excludeIds: string[]): Record<string, unknown> {
  return excludeIds.length ? { ...base, id: { notIn: excludeIds } } : base
}

const PIN_WHERE = (ids: string[]) => ({ id: { in: ids }, status: 'PUBLISHED' as const, boardType: { in: COMMUNITY_BOARDS }, ...EXCLUDE_GREETING })

/** 뜨는 이야기(BEST_HOT) — 누적 인기글 + 큐레이션 */
export function composeBestHot(opts: BestComposeOptions = {}): Promise<{ posts: PostSummary[]; total: number }> {
  const base = { status: 'PUBLISHED' as const, boardType: { in: COMMUNITY_BOARDS }, hotPromotedAt: { not: null }, AND: [EXCLUDE_GREETING] }
  return composeWithOverrides('BEST_HOT', opts, {
    rawSearch: getAccumulatedHotPosts,
    fetchPins: async ids =>
      (await prisma.post.findMany({ where: PIN_WHERE(ids), select: hotSelect })).map(toPostSummary),
    countAuto: ex => prisma.post.count({ where: withExclude(base, ex) }),
    fetchAuto: async (ex, skip, take) =>
      (await prisma.post.findMany({ where: withExclude(base, ex), select: hotSelect, orderBy: [{ hotPromotedAt: 'desc' }], skip, take })).map(toPostSummary),
  })
}

/** 명예의 전당(BEST_FAME) — HALL_OF_FAME + 큐레이션 */
export function composeBestFame(opts: BestComposeOptions = {}): Promise<{ posts: PostSummary[]; total: number }> {
  const base = { status: 'PUBLISHED' as const, boardType: { in: COMMUNITY_BOARDS }, promotionLevel: 'HALL_OF_FAME' as PromotionLevel, AND: [EXCLUDE_GREETING] }
  return composeWithOverrides('BEST_FAME', opts, {
    rawSearch: getHallOfFamePosts,
    fetchPins: async ids =>
      (await prisma.post.findMany({ where: PIN_WHERE(ids), select: postSelect })).map(toPostSummary),
    countAuto: ex => prisma.post.count({ where: withExclude(base, ex) }),
    fetchAuto: async (ex, skip, take) =>
      (await prisma.post.findMany({ where: withExclude(base, ex), select: postSelect, orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }], skip, take })).map(toPostSummary),
  })
}
