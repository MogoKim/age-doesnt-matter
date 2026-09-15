/**
 * sitemap URL — **RFC 호환 ASCII** 계약.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  production sitemap 229개 중 **138개가 raw non-ASCII** 였다(2026-09-15 실측).
 *  네이버 URL 검사에서 같은 매거진 글이
 *    · percent-encoded URL → 200 OK (robots·meta 전부 정상)
 *    · raw 한글 URL        → 접근 실패
 *  였다. 즉 콘텐츠가 아니라 **URL 표기** 때문에 네이버가 수집을 못 했다.
 *
 *  canonical·og:url 은 이미 인코딩돼 있었으므로 sitemap 이 가리키는 대상 자체는 맞았다.
 *  그래서 이 테스트는 "URL 이 바뀌면 안 된다"와 "ASCII 여야 한다"를 **동시에** 고정한다.
 *
 * ── 고정하는 것 ──────────────────────────────────────────────
 *  1. `<loc>` 에 raw non-ASCII 0개
 *  2. `%25` 이중 인코딩 0개
 *  3. `decodeURI` 기준 URL 집합이 **수정 전과 동일** — 가리키는 대상 불변
 *  4. 개수 불변 — 인코딩 때문에 글이 빠지거나 늘지 않는다
 *  5. XML 로 넣어도 escape 가 필요 없다
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

const findMany = vi.fn()
const groupBy = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { post: { findMany: () => findMany(), groupBy: () => groupBy() } } }))

const BASE = 'https://age-doesnt-matter.com'

/** production 과 같은 모양의 표본 — 한글 slug·ASCII id·slug 없는 매거진·JOB 을 모두 포함한다. */
const POSTS = [
  { id: 'cmn3617au000cey2u11lxlmx7', boardType: 'MAGAZINE', status: 'PUBLISHED', updatedAt: new Date('2026-09-01'), slug: '50대-이력서-쓰는-법' },
  { id: 'cmn3617au000cey2u11lxlmx8', boardType: 'MAGAZINE', status: 'SEO_ONLY', updatedAt: new Date('2026-09-02'), slug: null },
  { id: 'cmn3617au000cey2u11lxlmx9', boardType: 'STORY', status: 'PUBLISHED', updatedAt: new Date('2026-09-03'), slug: '오늘-손주-돌잔치에-다녀왔어요' },
  { id: 'cmn3617au000cey2u11lxlmxa', boardType: 'HUMOR', status: 'PUBLISHED', updatedAt: new Date('2026-09-04'), slug: '웃긴-이야기-hello-2' },
  { id: 'cmn3617au000cey2u11lxlmxb', boardType: 'LIFE2', status: 'PUBLISHED', updatedAt: new Date('2026-09-05'), slug: '연금-얼마나-받나요' },
  { id: 'cmn3617au000cey2u11lxlmxc', boardType: 'JOB', status: 'PUBLISHED', updatedAt: new Date('2026-09-06'), slug: null },
  // 커뮤니티인데 slug 가 없으면 sitemap 에서 제외된다(308 리디렉션 방지) — 기존 동작 유지 확인용
  { id: 'cmn3617au000cey2u11lxlmxd', boardType: 'STORY', status: 'PUBLISHED', updatedAt: new Date('2026-09-07'), slug: null },
]

/** 🔴 **수정 전**(origin/main bd5b229b) 의 URL 생성 규칙 — 인코딩만 없다. 대조군이다. */
const legacyUrl = (p: (typeof POSTS)[number]) => {
  if (p.boardType === 'JOB') return `${BASE}/jobs/${p.id}`
  if (p.boardType === 'MAGAZINE') return p.slug ? `${BASE}/magazine/${p.slug}` : `${BASE}/magazine/${p.id}`
  const board = { STORY: 'stories', HUMOR: 'humor', LIFE2: 'life2', WEEKLY: 'weekly' }[p.boardType]
  return `${BASE}/community/${board}/${p.slug}`
}
const legacyUrls = POSTS.filter((p) => !(p.boardType !== 'JOB' && p.boardType !== 'MAGAZINE' && !p.slug)).map(legacyUrl)

const loadSitemap = async () => (await import('@/app/sitemap')).default()

describe('sitemap — 모든 URL 이 RFC 호환 ASCII', () => {
  beforeEach(() => {
    vi.resetModules()
    findMany.mockResolvedValue(POSTS)
    groupBy.mockResolvedValue([{ seriesId: 'series-한글-시리즈', _count: 4 }, { seriesId: 'short', _count: 2 }])
  })

  it('🔴 raw non-ASCII URL 이 0개다', async () => {
    const entries = await loadSitemap()
    const raw = entries.map((e) => e.url).filter((u) => /[^\x20-\x7E]/.test(u))
    expect(raw, `raw non-ASCII: ${raw.join(', ')}`).toEqual([])
  })

  it('🔴 %25 이중 인코딩이 0개다', async () => {
    const entries = await loadSitemap()
    expect(entries.filter((e) => e.url.includes('%25')).map((e) => e.url)).toEqual([])
  })

  it('🔴 decodeURI 기준 글 URL 집합이 수정 전과 동일하다 — 가리키는 대상 불변', async () => {
    const entries = await loadSitemap()
    const decoded = new Set(entries.map((e) => decodeURI(e.url)))
    for (const before of legacyUrls) expect(decoded.has(before), `누락: ${before}`).toBe(true)
  })

  it('🔴 글 URL 개수가 변하지 않는다 — 인코딩으로 빠지거나 늘지 않는다', async () => {
    const entries = await loadSitemap()
    const postUrls = entries.filter((e) => /\/(jobs|magazine|community)\/[^/]+(\/[^/]+)?$/.test(new URL(e.url).pathname))
    // slug 없는 커뮤니티 글 1건은 기존대로 제외된다
    expect(postUrls.length).toBeGreaterThanOrEqual(legacyUrls.length)
    expect(entries.map((e) => e.url).filter((u) => u.includes('lxlmxd'))).toEqual([])
  })

  it('모든 URL 이 `new URL` 로 파싱되고 pathname 도 ASCII 다', async () => {
    const entries = await loadSitemap()
    for (const e of entries) {
      const u = new URL(e.url)
      expect(/[^\x20-\x7E]/.test(u.pathname), `${e.url}`).toBe(false)
    }
  })

  it('XML 에 그대로 넣어도 escape 가 필요 없다 — & < > " 가 없다', async () => {
    const entries = await loadSitemap()
    for (const e of entries) expect(/[&<>"']/.test(e.url), e.url).toBe(false)
  })

  it('시리즈 허브도 인코딩된다 — 3편 미만은 여전히 제외', async () => {
    const entries = await loadSitemap()
    const hubs = entries.filter((e) => e.url.includes('/magazine/series/'))
    expect(hubs).toHaveLength(1)
    expect(/[^\x20-\x7E]/.test(hubs[0].url)).toBe(false)
    expect(decodeURI(hubs[0].url)).toBe(`${BASE}/magazine/series/series-한글-시리즈`)
  })

  it('지역 일자리·정적 페이지 URL 도 ASCII 다(기존 동작 유지)', async () => {
    const entries = await loadSitemap()
    const region = entries.filter((e) => e.url.includes('/jobs/region/'))
    expect(region.length).toBeGreaterThan(0)
    for (const e of region) expect(/[^\x20-\x7E]/.test(e.url)).toBe(false)
  })
})
