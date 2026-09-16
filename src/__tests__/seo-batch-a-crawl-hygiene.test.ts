/**
 * Batch A — 크롤 위생 계약 (2026-09-16)
 *
 * ── 왜 필요한가 (전부 production 실측 근거) ─────────────────────
 *  1. `/community/<다른보드>/<slug>` 가 **HTTP 500** 이었다(9/9 재현, `x-matched-path: /500`).
 *     상세 라우트는 `dynamic = 'force-static'` 인데 `generateMetadata` 안에서
 *     `permanentRedirect()` 를 부르면 정적 생성 중 redirect 가 되어 터진다.
 *     → 308 은 **렌더 전에 도는 middleware** 가 보낸다(CUID→slug 와 같은 자리).
 *        페이지는 redirect 대신 **정본 canonical** 만 준다.
 *  2. `?page=12`(마지막 페이지 초과)가 **200 + 글 0건** 이었다 — soft-404 생성기.
 *     단 **글이 하나도 없는 게시판의 page=1 은 200 이어야 한다**(정상 빈 목록).
 *  3. `/best`(SSR 본문 366자·콘텐츠 링크 0) 와 `/search`(424자) 가 sitemap 에 있었다.
 *  4. sitemap `lastmod` 188건 중 **175건(93%)이 최근 3일** 이었다. 원인은 조회수:
 *     글을 볼 때마다 `viewCount: { increment: 1 }` → Prisma `@updatedAt` 이 `updatedAt` 을
 *     오늘로 바꾼다 → sitemap `lastModified` 와 JSON-LD `dateModified` 가 같이 오염된다.
 *     → **거짓 날짜보다 무날짜가 낫다.** 둘 다 뺀다.
 *
 * ── 건드리지 않는 것 (회귀 금지) ───────────────────────────────
 *  · 일반 `<meta name="robots">` 는 `index, follow` 유지 — 네이버 수집 경로 보존
 *  · sitemap URL 의 ASCII 계약(raw 한글 0 · `%25` 0) 과 **글 URL 집합**
 *  · `guide.updatedAt` 기반 dateModified 는 정적 데이터라 오염되지 않는다 → 유지
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDiscussionForumJsonLd } from '@/lib/seo/discussion-forum'
import { resolveCommunityCanonicalPath } from '@/lib/community-canonical'
import { isPageOutOfRange, LIST_PAGE_SIZE } from '@/lib/list-query'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

const findMany = vi.fn()
const groupBy = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { post: { findMany: () => findMany(), groupBy: () => groupBy() } } }))

const BASE = 'https://age-doesnt-matter.com'

const POSTS = [
  { id: 'cmn3617au000cey2u11lxlmx7', boardType: 'MAGAZINE', status: 'PUBLISHED', updatedAt: new Date('2026-09-01'), slug: '50대-이력서-쓰는-법' },
  { id: 'cmn3617au000cey2u11lxlmx9', boardType: 'STORY',    status: 'PUBLISHED', updatedAt: new Date('2026-09-03'), slug: '오늘-손주-돌잔치에-다녀왔어요' },
  { id: 'cmn3617au000cey2u11lxlmxc', boardType: 'JOB',      status: 'PUBLISHED', updatedAt: new Date('2026-09-06'), slug: null },
]

const loadSitemap = async () => (await import('@/app/sitemap')).default()

describe('Batch A-1 · sitemap: 내용 없는 정적 페이지 제외', () => {
  beforeEach(() => {
    vi.resetModules()
    findMany.mockResolvedValue(POSTS)
    groupBy.mockResolvedValue([])
  })

  it('🔴 /best 가 sitemap 에 없다 — SSR 본문 366자·콘텐츠 링크 0', async () => {
    const urls = (await loadSitemap()).map((e) => e.url)
    expect(urls).not.toContain(`${BASE}/best`)
  })

  it('🔴 /search 가 sitemap 에 없다 — 검색 폼은 수집 대상이 아니다', async () => {
    const urls = (await loadSitemap()).map((e) => e.url)
    expect(urls).not.toContain(`${BASE}/search`)
  })

  it('나머지 정적 페이지는 그대로 남는다 — 과잉 제거 방지', async () => {
    const urls = (await loadSitemap()).map((e) => e.url)
    for (const keep of ['', '/about', '/jobs', '/magazine', '/guide', '/topic/menopause', '/topic/second-act', '/terms', '/privacy', '/rules']) {
      expect(urls, `사라지면 안 됨: ${keep || '(홈)'}`).toContain(`${BASE}${keep}`)
    }
  })

  it('커뮤니티 목록·지역 일자리 URL 도 그대로다', async () => {
    const urls = (await loadSitemap()).map((e) => e.url)
    expect(urls).toContain(`${BASE}/community/stories`)
    expect(urls.filter((u) => u.includes('/jobs/region/')).length).toBe(17)
  })
})

describe('Batch A-2 · sitemap: 오염된 lastmod 제거', () => {
  beforeEach(() => {
    vi.resetModules()
    findMany.mockResolvedValue(POSTS)
    groupBy.mockResolvedValue([])
  })

  it('🔴 어떤 항목에도 lastModified 가 없다 — 조회수가 updatedAt 을 오늘로 바꾼다', async () => {
    const entries = await loadSitemap()
    const withLastmod = entries.filter((e) => e.lastModified !== undefined)
    expect(withLastmod.map((e) => e.url), 'lastModified 잔존').toEqual([])
  })

  it('changefreq·priority 는 유지된다 — lastmod 만 뺀다', async () => {
    const entries = await loadSitemap()
    expect(entries.every((e) => e.changeFrequency !== undefined)).toBe(true)
    expect(entries.every((e) => typeof e.priority === 'number')).toBe(true)
  })
})

describe('Batch A-3 · sitemap ASCII 계약 회귀 없음', () => {
  beforeEach(() => {
    vi.resetModules()
    findMany.mockResolvedValue(POSTS)
    groupBy.mockResolvedValue([])
  })

  it('raw non-ASCII 0개 · %25 0개', async () => {
    const urls = (await loadSitemap()).map((e) => e.url)
    expect(urls.filter((u) => /[^\x20-\x7E]/.test(u))).toEqual([])
    expect(urls.filter((u) => u.includes('%25'))).toEqual([])
  })

  it('글 URL 집합이 그대로다 — Batch A 는 글을 빼지 않는다', async () => {
    const decoded = new Set((await loadSitemap()).map((e) => decodeURI(e.url)))
    expect(decoded.has(`${BASE}/magazine/50대-이력서-쓰는-법`)).toBe(true)
    expect(decoded.has(`${BASE}/community/stories/오늘-손주-돌잔치에-다녀왔어요`)).toBe(true)
    expect(decoded.has(`${BASE}/jobs/cmn3617au000cey2u11lxlmxc`)).toBe(true)
  })
})

describe('Batch A-4 · DiscussionForumPosting: dateModified 는 선택', () => {
  const base = {
    title: '갱년기 불면 어떻게 버티세요',
    text: '요즘 새벽 3시에 자꾸 깨요.',
    authorName: '익명',
    datePublished: '2026-07-01T00:00:00.000Z',
    url: `${BASE}/community/menopause/갱년기-불면`,
    likeCount: 2, viewCount: 30, commentCount: 11,
    publisherName: '우리 나이가 어때서', publisherUrl: BASE,
    comments: [] as { authorName: string; text: string; datePublished: string }[],
  }

  it('🔴 dateModified 를 넘기지 않으면 필드 자체가 없다', () => {
    const ld = buildDiscussionForumJsonLd(base)
    expect('dateModified' in ld).toBe(false)
  })

  it('datePublished 는 필수라 그대로 남는다', () => {
    const ld = buildDiscussionForumJsonLd(base)
    expect(ld.datePublished).toBe(base.datePublished)
  })

  it('명시적으로 넘기면 유지된다 — 정적 데이터(가이드) 경로 보존', () => {
    const ld = buildDiscussionForumJsonLd({ ...base, dateModified: '2026-08-01T00:00:00.000Z' })
    expect(ld.dateModified).toBe('2026-08-01T00:00:00.000Z')
  })

  it('comment[] 상한은 설계다 — commentCount 11 과 embedded 수가 달라도 결함이 아니다', () => {
    const comments = Array.from({ length: 14 }, (_, n) => ({ authorName: `c${n}`, text: `t${n}`, datePublished: base.datePublished }))
    const ld = buildDiscussionForumJsonLd({ ...base, comments })
    expect((ld.comment as unknown[]).length).toBe(10)
    const cc = (ld.interactionStatistic as { interactionType: string; userInteractionCount: number }[])
      .find((s) => s.interactionType.endsWith('CommentAction'))
    expect(cc?.userInteractionCount).toBe(11)
  })
})

describe('Batch A-5 · 크로스보드 정본 경로 (middleware 가 308 로 보낼 값)', () => {
  const SLUG = '아이폰듀오-삼백만원-주고-사면-주책'

  it('🔴 URL 보드가 글의 보드와 다르면 정본 경로를 돌려준다', () => {
    for (const wrong of ['humor', 'life2', 'menopause']) {
      expect(resolveCommunityCanonicalPath({
        boardSlug: wrong, postId: SLUG, post: { boardType: 'STORY', slug: SLUG },
      })).toBe(`/community/stories/${SLUG}`)
    }
  })

  it('보드가 맞으면 null — 불필요한 redirect 를 만들지 않는다', () => {
    expect(resolveCommunityCanonicalPath({
      boardSlug: 'stories', postId: SLUG, post: { boardType: 'STORY', slug: SLUG },
    })).toBeNull()
  })

  it('CUID 접근은 slug 로 교정된다 (기존 계약 유지)', () => {
    expect(resolveCommunityCanonicalPath({
      boardSlug: 'stories', postId: 'cmomh67bu0006sf3fwrmhq0it', post: { boardType: 'STORY', slug: SLUG },
    })).toBe(`/community/stories/${SLUG}`)
  })

  it('WEEKLY·MAGAZINE 등 비활성 보드는 URL 보드를 유지한다 (기존 계약 유지)', () => {
    expect(resolveCommunityCanonicalPath({
      boardSlug: 'weekly', postId: SLUG, post: { boardType: 'WEEKLY', slug: SLUG },
    })).toBeNull()
  })

  it('정본 경로를 그대로 URL 에 넣으면 ASCII 로 인코딩된다 — Location 헤더 계약', () => {
    const path = resolveCommunityCanonicalPath({
      boardSlug: 'humor', postId: SLUG, post: { boardType: 'STORY', slug: SLUG },
    })!
    const loc = new URL(path, BASE).toString()
    expect(/[^\x20-\x7E]/.test(loc)).toBe(false)
    expect(loc.includes('%25')).toBe(false)
    expect(decodeURI(loc)).toBe(`${BASE}/community/stories/${SLUG}`)
  })
})

describe('Batch A-6 · 페이지네이션 경계', () => {
  it('🔴 마지막 페이지를 넘어서면 범위 밖이다 (→ 404)', () => {
    // 총 30건, 12건/페이지 → 마지막은 3페이지
    expect(isPageOutOfRange(4, 30)).toBe(true)
    expect(isPageOutOfRange(12, 30)).toBe(true)
  })

  it('🔴 마지막 페이지 자체는 범위 안이다 (→ 200)', () => {
    expect(isPageOutOfRange(3, 30)).toBe(false)
  })

  it('🔴 글이 0건인 게시판의 1페이지는 범위 안이다 (→ 200, 빈 목록 정상)', () => {
    expect(isPageOutOfRange(1, 0)).toBe(false)
  })

  it('글이 0건인 게시판의 2페이지는 범위 밖이다 (→ 404)', () => {
    expect(isPageOutOfRange(2, 0)).toBe(true)
  })

  it('정확히 한 페이지로 떨어지면 경계가 맞다', () => {
    expect(isPageOutOfRange(1, LIST_PAGE_SIZE)).toBe(false)
    expect(isPageOutOfRange(2, LIST_PAGE_SIZE)).toBe(true)
  })

  it('페이지 크기는 목록 쿼리와 같은 상수를 쓴다 — 두 곳이 갈리면 경계가 어긋난다', () => {
    expect(LIST_PAGE_SIZE).toBe(12)
  })
})
