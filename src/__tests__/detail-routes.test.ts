import { describe, it, expect } from 'vitest'
import { isDetailRoute } from '@/lib/detail-routes'

/**
 * 상세 상단 띠배너(DETAIL_HEADER)가 뜨는 경로 판별.
 *
 * 목록 띠(LIST_HEADER)는 고정 경로 배열이라 정확 매칭이면 끝나지만,
 * 상세는 글마다 경로가 달라 판별 함수가 필요하다.
 * 여기서 한 글자 틀리면 글쓰기 화면이나 목록에 광고가 뜬다.
 */

describe('isDetailRoute — 통과해야 하는 상세 경로', () => {
  it('커뮤니티 4보드 글 상세', () => {
    expect(isDetailRoute('/community/stories/abc123')).toBe(true)
    expect(isDetailRoute('/community/menopause/abc123')).toBe(true)
    expect(isDetailRoute('/community/life2/abc123')).toBe(true)
    expect(isDetailRoute('/community/humor/abc123')).toBe(true)
  })

  it('slug 형태의 긴 postId도 통과', () => {
    expect(isDetailRoute('/community/stories/염색-자주-하시는분들')).toBe(true)
  })

  it('매거진 상세', () => {
    expect(isDetailRoute('/magazine/cmabc123')).toBe(true)
    expect(isDetailRoute('/magazine/국민연금-늦게-받으면')).toBe(true)
  })

  it('내일찾기 상세', () => {
    expect(isDetailRoute('/jobs/cmsfwlyyl0004ek4s94buhsls')).toBe(true)
  })
})

describe('isDetailRoute — 떠서는 안 되는 경로', () => {
  it('목록 페이지에는 안 뜬다 (목록은 LIST_HEADER 담당)', () => {
    expect(isDetailRoute('/community/stories')).toBe(false)
    expect(isDetailRoute('/community/menopause')).toBe(false)
    expect(isDetailRoute('/magazine')).toBe(false)
    expect(isDetailRoute('/jobs')).toBe(false)
    expect(isDetailRoute('/best')).toBe(false)
    expect(isDetailRoute('/')).toBe(false)
  })

  it('글쓰기 화면에는 안 뜬다', () => {
    expect(isDetailRoute('/community/write')).toBe(false)
    expect(isDetailRoute('/community/write/select')).toBe(false)
  })

  it('수정 화면에는 안 뜬다 — 조각이 4개', () => {
    expect(isDetailRoute('/community/stories/abc123/edit')).toBe(false)
  })

  it('매거진 시리즈·내일찾기 지역 하위 라우트에는 안 뜬다', () => {
    expect(isDetailRoute('/magazine/series/1')).toBe(false)
    expect(isDetailRoute('/magazine/series')).toBe(false)
    expect(isDetailRoute('/jobs/region/seoul')).toBe(false)
    expect(isDetailRoute('/jobs/region')).toBe(false)
  })

  it('없는 보드 slug는 통과시키지 않는다', () => {
    expect(isDetailRoute('/community/weekly/abc123')).toBe(false)
    expect(isDetailRoute('/community/nope/abc123')).toBe(false)
  })

  it('다른 화면들', () => {
    expect(isDetailRoute('/my')).toBe(false)
    expect(isDetailRoute('/events/abc')).toBe(false)
    expect(isDetailRoute('/guide/some-slug')).toBe(false)
    expect(isDetailRoute('/admin/banners')).toBe(false)
  })

  it('빈 값 방어', () => {
    expect(isDetailRoute(null)).toBe(false)
    expect(isDetailRoute(undefined)).toBe(false)
    expect(isDetailRoute('')).toBe(false)
  })

  it('쿼리·해시가 붙어도 경로만 본다', () => {
    expect(isDetailRoute('/community/stories/abc123?src=home')).toBe(true)
    expect(isDetailRoute('/community/stories?page=2')).toBe(false)
  })

  it('끝 슬래시가 붙어도 같은 판정', () => {
    expect(isDetailRoute('/community/stories/abc123/')).toBe(true)
    expect(isDetailRoute('/community/stories/')).toBe(false)
  })
})
