import { describe, it, expect } from 'vitest'
import { MENOPAUSE_MOVED_POSTS, MOVED_POST_REDIRECTS, getMovedPostRedirect } from '@/lib/moved-posts'

describe('moved-posts — 갱년기 톡 이동 30건 확정 목록 (PR-M1)', () => {
  it('정확히 30건, id/slug 중복 없음', () => {
    expect(MENOPAUSE_MOVED_POSTS.length).toBe(30)
    expect(new Set(MENOPAUSE_MOVED_POSTS.map((p) => p.id)).size).toBe(30)
    expect(new Set(MENOPAUSE_MOVED_POSTS.map((p) => p.slug)).size).toBe(30)
  })

  it('창업자 결정 반영: #19·#18 교체 글 포함, 제외 글 부재, 성욕 소재 1건만', () => {
    const slugs = MENOPAUSE_MOVED_POSTS.map((p) => p.slug)
    expect(slugs).toContain('자꾸-눈물이-나는-갱년기')
    expect(slugs).toContain('혹시-저만-요즘-화끈거리고-우울한-건가요-갱년기-맞을까봐')
    expect(slugs).not.toContain('폐경되면-성욕이-확-없어지나요')
    expect(slugs).not.toContain('72년생-대체-폐경은-언제-되나요')
    expect(MENOPAUSE_MOVED_POSTS.filter((p) => p.title.includes('성욕')).length).toBe(1)
  })

  it('카테고리 균형 보정안 분포: 완경12/몸8/나만5/마음3/가족2', () => {
    const dist: Record<string, number> = {}
    for (const p of MENOPAUSE_MOVED_POSTS) dist[p.newCategory] = (dist[p.newCategory] ?? 0) + 1
    expect(dist).toEqual({
      '완경·호르몬': 12,
      '몸의 변화': 8,
      '나만 이런가요': 5,
      '마음의 변화': 3,
      '가족·관계': 2,
    })
  })

  it('redirect 맵: 30건 전부 stories→menopause, slug 불변', () => {
    expect(Object.keys(MOVED_POST_REDIRECTS).length).toBe(30)
    for (const p of MENOPAUSE_MOVED_POSTS) {
      expect(MOVED_POST_REDIRECTS[`/community/stories/${p.slug}`]).toBe(`/community/menopause/${p.slug}`)
    }
  })

  it('getMovedPostRedirect: 디코드/인코드 경로 모두 매치', () => {
    const slug = MENOPAUSE_MOVED_POSTS[0].slug
    expect(getMovedPostRedirect(`/community/stories/${slug}`)).toBe(`/community/menopause/${slug}`)
    expect(getMovedPostRedirect(`/community/stories/${encodeURIComponent(slug)}`)).toBe(`/community/menopause/${slug}`)
  })

  it('getMovedPostRedirect: 비대상은 null (기존 stories 글·타 보드·CUID)', () => {
    expect(getMovedPostRedirect('/community/stories/보통-주말에-뭐하세요')).toBeNull()
    expect(getMovedPostRedirect('/community/life2/아무-글')).toBeNull()
    expect(getMovedPostRedirect('/community/stories/cmr32xatf0001003gurqjtfxr')).toBeNull() // CUID는 맵 밖 — PR-M0 가드 담당
    expect(getMovedPostRedirect('/community/stories')).toBeNull()
    expect(getMovedPostRedirect('/best')).toBeNull()
  })

  it('전 항목 제목에 갱년기/폐경/완경 명시 (약 후보 배제 증빙)', () => {
    for (const p of MENOPAUSE_MOVED_POSTS) {
      expect(['갱년기', '폐경', '완경'].some((k) => p.title.includes(k)), p.title).toBe(true)
    }
  })
})
