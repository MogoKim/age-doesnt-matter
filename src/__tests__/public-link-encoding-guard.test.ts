/**
 * 공개 SSR 링크 — **slug 를 날것으로 붙이지 마라** 가드.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  2026-09-15 실측: production sitemap 229개 중 138개가 raw 한글 URL 이었고,
 *  네이버 URL 검사에서 raw 한글 URL 은 **접근 실패**, percent-encoded URL 은 200 이었다.
 *  서버 렌더링된 목록의 일부 href 도 raw 한글이라 크롤러가 따라갈 수 없었다.
 *
 *  sitemap 만 고치면 목록 → 상세 크롤 경로가 그대로 남는다. 그래서 **링크 생성기 자체**를
 *  `@/lib/post-url` 하나로 모으고, 새 코드가 다시 템플릿 문자열로 slug 를 붙이면 여기서 막는다.
 *
 * ── 대상 ────────────────────────────────────────────────────
 *  크롤러가 읽는 **공개 SSR 표면**만 본다. 어드민·/my 는 로그인 뒤라 검색 노출면이 아니다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 공개면에서 글 링크를 만드는 파일들. 새 링크 지점이 생기면 여기 추가한다. */
const PUBLIC_LINK_FILES = [
  'src/components/features/home/StoriesSection.tsx',
  'src/components/features/home/HumorSection.tsx',
  'src/components/features/home/TrendingSection.tsx',
  'src/components/features/home/MagazineSection.tsx',
  'src/components/features/home/NewcomerWelcomeSection.tsx',
  'src/components/features/community/PostCard.tsx',
  'src/components/features/community/PostListBottom.tsx',
  'src/components/features/community/NextPostsInline.tsx',
  'src/components/features/magazine/MagazineContent.tsx',
  'src/components/features/magazine/SeriesNav.tsx',
  'src/components/features/search/SearchResults.tsx',
  'src/app/(main)/magazine/[id]/page.tsx',
  'src/lib/seo/topic-menopause.ts',
  'src/lib/seo/topic-second-act.ts',
  'src/lib/votes.ts',
  'src/app/sitemap.ts',
] as const

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')

/**
 * 인코딩 없이 slug 를 경로 끝에 붙이는 패턴.
 * 예: `` `/magazine/${post.slug ?? post.id}` `` · `` `/community/${boardSlug}/${post.slug}` ``
 * `encodePathSegment(...)` · `buildPostPath(...)` 를 거치면 걸리지 않는다.
 */
const RAW_SLUG_IN_PATH = /`\/(?:magazine|jobs|community)\/[^`]*\$\{\s*(?!encodePathSegment|buildPostPath)[A-Za-z_$][\w$.]*\.slug\b[^`]*`/g

/**
 * 🔴 **리디렉션·캐시 무효화는 대상이 아니다.**
 *  · `permanentRedirect('/magazine/<한글>')` → Next 가 Location 헤더를 **직접 percent-encode** 한다
 *    (2026-09-15 실측: production 301 의 location 이 이미 `%EC%98%A4...`).
 *    여기서 미리 인코딩하면 의미가 겹칠 위험만 생긴다.
 *  · `revalidatePath` 는 URL 이 아니라 **라우트 경로 키**다. 인코딩하면 캐시가 안 지워진다.
 */
const NOT_A_LINK = /^\s*(?:\/\/|\*)|(?:permanentRedirect|redirect|revalidatePath|revalidate)\s*\(/

describe('공개 SSR 링크는 경로 segment 를 인코딩해서 만든다', () => {
  it.each(PUBLIC_LINK_FILES)('%s — slug 를 날것으로 붙이지 않는다', (file) => {
    const hits = read(file)
      .split('\n')
      .filter((line) => !NOT_A_LINK.test(line))
      .flatMap((line) => line.match(RAW_SLUG_IN_PATH) ?? [])
    expect(hits, `인코딩 안 된 링크: ${hits.join(' | ')}`).toEqual([])
  })

  it('🔴 URL 생성은 `@/lib/post-url` 로 모인다 — 링크 파일이 이 모듈을 쓴다', () => {
    // sitemap·votes·topic 허브까지 포함해 **한 규칙**을 쓰는지 본다.
    const without = PUBLIC_LINK_FILES.filter((f) => !read(f).includes("from '@/lib/post-url'"))
    expect(without, `post-url 을 안 쓰는 링크 파일: ${without.join(', ')}`).toEqual([])
  })

  it('post-url 은 `/` 를 인코딩하지 않는다 — 경로 구조 보존이 계약이다', () => {
    // 주석은 빼고 **코드만** 본다 — 주석에서 `%2F` 를 설명하는 건 위반이 아니다.
    const src = read('src/lib/post-url.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toContain('%2F')
    // segment 단위로 쪼갠 뒤 encodeURIComponent 를 거는 구조여야 한다
    expect(src).toContain('encodeURIComponent')
  })
})
