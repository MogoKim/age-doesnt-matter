import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PostSummary } from '@/types/api'

/**
 * 목록 페이지가 **서버 HTML 에 글 링크를 담는지** 지킨다.
 *
 * 배경(2026-09-10 production 실측): `/community/stories` 의 서버 HTML 은 내비·푸터 **380자**뿐이고
 * **글 링크가 0건**이었다. 글 제목은 RSC 페이로드 `<script>` 안에만 있었다.
 * 원인은 목록 컴포넌트가 `useSearchParams()` 를 렌더 중에 부르는 것이다 —
 * 정적 렌더(`revalidate`) 페이지에서 그 호출은 트리를 가장 가까운 Suspense 경계까지
 * **CSR 로 bail out** 시킨다. JS 를 실행하지 않는 수집기에게 목록은 빈 껍데기가 되고,
 * 글은 sitemap 으로만 발견된다 — 내부 링크 경로가 사라진다.
 *
 * 이 테스트는 두 층을 본다.
 *  1. **소스 계약** — 목록 컴포넌트가 `useSearchParams` 를 직접 부르지 않는다.
 *  2. **실제 출력** — 서버 렌더 결과에 `<a href>` 글 링크가 실제로 있다.
 */
const ROOT = path.resolve(__dirname, '../..')

/** 주석을 지운 소스 — 설명문에 적힌 `useSearchParams()` 를 실제 호출로 오인하지 않도록. */
function codeOf(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** 정적 렌더 목록 컴포넌트 — 여기서 `useSearchParams()` 를 부르면 SSR 이 깨진다. */
const LIST_COMPONENTS = [
  'src/components/features/community/BoardPostListClient.tsx',
  'src/components/features/magazine/MagazineContent.tsx',
  'src/components/features/jobs/JobsContent.tsx',
]

describe('[SSR-1] 목록 컴포넌트는 useSearchParams 를 직접 부르지 않는다', () => {
  it.each(LIST_COMPONENTS)('%s', (rel) => {
    const code = codeOf(rel)
    expect(code, `${rel} 이 useSearchParams 를 직접 부르면 서버 HTML 에서 목록이 사라진다`).not.toMatch(/useSearchParams\s*\(/)
    expect(code, `${rel} 은 SearchParamsBridge 로 쿼리를 받아야 한다`).toContain('SearchParamsBridge')
  })

  it('다리 컴포넌트만 useSearchParams 를 부르고, Suspense 로 감싸 bail out 을 가둔다', () => {
    const code = codeOf('src/components/features/common/SearchParamsBridge.tsx')
    expect(code).toMatch(/useSearchParams\s*\(/)
    expect(code).toContain('<Suspense')
    // 다리는 아무것도 그리지 않아야 한다 — 그려야 할 것이 있으면 그것도 CSR 로 밀려난다.
    expect(code).toMatch(/return null/)
  })

  it('쿼리를 렌더 중이 아니라 effect 에서 전달한다 — hydration mismatch 방지', () => {
    const code = codeOf('src/components/features/common/SearchParamsBridge.tsx')
    expect(code).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{\s*onChange\(/)
  })
})

/**
 * 목록이 SSR 되면서 **상대시각이 hydration mismatch 를 일으킨다.**
 * `formatTimeAgo` 는 렌더 시점의 `now` 를 쓰므로 서버 HTML("3시간 전")과
 * hydration 시점("4시간 전")이 달라진다. 실측(2026-09-10 Preview): `/community/stories` #418 5/5.
 * 의도된 차이라 해당 텍스트 노드에서만 경고를 끈다 — `CommentItem` 과 같은 처리(PR #357).
 */
describe('[SSR-4] 목록 쿼리 해석은 서버·클라이언트가 같은 규칙을 쓴다', () => {
  it('page·sort 만 서버가 책임지고, page 는 1 이상으로 정규화된다', async () => {
    const { parseListQuery } = await import('@/lib/list-query')
    expect(parseListQuery({}).page).toBe(1)
    expect(parseListQuery({ page: '2' }).page).toBe(2)
    expect(parseListQuery({ page: '0' }).page).toBe(1)
    expect(parseListQuery({ page: 'abc' }).page).toBe(1)
    expect(parseListQuery({ page: '-3' }).page).toBe(1)
    expect(parseListQuery({ sort: 'likes' }).sort).toBe('likes')
    expect(parseListQuery({ sort: '이상한값' }).sort).toBe('latest')
  })

  it('정규화 쿼리는 page=1·latest 를 빈 문자열로 만든다 — 서버 기본 렌더와 같다는 뜻', async () => {
    const { parseListQuery } = await import('@/lib/list-query')
    expect(parseListQuery({}).query).toBe('')
    expect(parseListQuery({ page: '1' }).query).toBe('')
    expect(parseListQuery({ page: '2' }).query).toBe('page=2')
    expect(parseListQuery({ sort: 'likes', page: '3' }).query).toBe('sort=likes&page=3')
  })

  it('클라이언트 전용 축(검색·카테고리·지역)이 있으면 서버 렌더와 다르다고 본다', async () => {
    const { normalizeClientQuery } = await import('@/lib/list-query')
    expect(normalizeClientQuery('')).toBe('')
    expect(normalizeClientQuery('page=2')).toBe('page=2')
    expect(normalizeClientQuery('q=갱년기')).toMatch(/^client:/)
    expect(normalizeClientQuery('category=건강')).toMatch(/^client:/)
    expect(normalizeClientQuery('region=서울')).toMatch(/^client:/)
    // '전체' 는 필터가 없는 것과 같다
    expect(normalizeClientQuery('category=전체')).toBe('')
  })
})

describe('[SSR-5] 로딩 중에도 다리를 유지한다', () => {
  it.each([
    'src/components/features/magazine/MagazineContent.tsx',
    'src/components/features/jobs/JobsContent.tsx',
    'src/components/features/community/BoardPostListClient.tsx',
  ])('%s 의 로딩 분기에 bridge 가 있다', (rel) => {
    const code = codeOf(rel)
    const loadingBlock = code.slice(code.indexOf('isLoading'))
    const upToReturn = loadingBlock.slice(0, loadingBlock.indexOf('data.posts.length === 0') + 1 || 2000)
    expect(upToReturn, `${rel} 로딩 중 다리가 빠지면 그 사이 URL 변경(뒤로가기 포함)을 놓친다`).toContain('bridge')
  })
})

describe('[SSR-3] SSR 되는 상대시각은 suppressHydrationWarning 을 단다', () => {
  it.each([
    ['src/components/features/community/PostCard.tsx', 'post.createdAt'],
    ['src/components/features/magazine/MagazineContent.tsx', 'post.createdAt'],
    ['src/components/features/jobs/JobCard.tsx', 'job.createdAt'],
  ])('%s', (rel, field) => {
    const code = codeOf(rel)
    const line = code.split('\n').find((l) => l.includes(`formatTimeAgo(${field})`))
    expect(line, `${rel} 에서 formatTimeAgo 렌더 줄을 찾지 못했다`).toBeDefined()
    expect(line, `${rel} 의 상대시각에 suppressHydrationWarning 이 없으면 React #418 이 재발한다`)
      .toMatch(/suppressHydrationWarning/)
  })
})

describe('[SSR-2] 서버 렌더 출력에 글 링크가 실제로 있다', () => {
  const posts: PostSummary[] = [
    {
      id: 'p1', title: '첫 번째 글 제목', preview: '미리보기', slug: '첫-번째-글',
      category: '', authorId: 'u1', author: { id: 'u1', nickname: '작성자', profileImage: null },
      likeCount: 1, commentCount: 2, viewCount: 3, promotionLevel: 'NORMAL',
      hotPromotedAt: null, isPinned: false, trendingScore: 0, createdAt: new Date().toISOString(),
    } as unknown as PostSummary,
    {
      id: 'p2', title: '두 번째 글 제목', preview: '미리보기', slug: '두-번째-글',
      category: '', authorId: 'u2', author: { id: 'u2', nickname: '작성자', profileImage: null },
      likeCount: 0, commentCount: 0, viewCount: 0, promotionLevel: 'NORMAL',
      hotPromotedAt: null, isPinned: false, trendingScore: 0, createdAt: new Date().toISOString(),
    } as unknown as PostSummary,
  ]

  it('BoardPostListClient 는 initialPosts 를 <a href> 로 서버 렌더한다', async () => {
    // 다리는 Next 런타임 밖에서 못 도는 훅을 쓰므로, 실제 서버 렌더와 같은 조건
    // (= 쿼리를 아직 모르는 상태)을 만들기 위해 빈 쿼리를 돌려주도록 고정한다.
    vi.doMock('next/navigation', () => ({
      useSearchParams: () => new URLSearchParams(''),
      usePathname: () => '/community/stories',
      useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
    }))
    const { default: BoardPostListClient } = await import('@/components/features/community/BoardPostListClient')

    const html = renderToStaticMarkup(
      <BoardPostListClient boardSlug="stories" boardType="STORY" initialPosts={posts} initialTotal={posts.length} initialQuery="" />,
    )

    const links = [...html.matchAll(/href="(\/community\/stories\/[^"]+)"/g)].map((m) => m[1])
    expect(links.length, '서버 HTML 에 글 링크가 없으면 수집기가 목록에서 글을 찾지 못한다').toBeGreaterThanOrEqual(posts.length)
    expect(html).toContain('첫 번째 글 제목')
    expect(html).toContain('두 번째 글 제목')
    vi.doUnmock('next/navigation')
  })
})
