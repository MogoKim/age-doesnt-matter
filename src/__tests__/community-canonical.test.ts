import { describe, it, expect } from 'vitest'
import { resolveCommunityCanonicalPath } from '@/lib/community-canonical'

describe('resolveCommunityCanonicalPath — 보드 불일치+CUID 통합 308 (PR-M0)', () => {
  it('MENOPAUSE 글을 stories slug URL로 접근 → menopause 정본으로', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: '갱년기-불면', post: { boardType: 'MENOPAUSE', slug: '갱년기-불면' } }),
    ).toBe('/community/menopause/갱년기-불면')
  })

  it('MENOPAUSE 글을 stories CUID URL로 접근 → 보드+slug 동시 교정 1회 redirect', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'cmCUID', post: { boardType: 'MENOPAUSE', slug: '갱년기-불면' } }),
    ).toBe('/community/menopause/갱년기-불면')
  })

  it('정본 URL(menopause slug) 접근 → null (redirect 없음)', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'menopause', postId: '갱년기-불면', post: { boardType: 'MENOPAUSE', slug: '갱년기-불면' } }),
    ).toBeNull()
  })

  it('기존 STORY 정상 slug 접근 → null (회귀 없음)', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 's1', post: { boardType: 'STORY', slug: 's1' } }),
    ).toBeNull()
  })

  it('기존 CUID→slug redirect 유지 (보드 일치 시)', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'cmCUID', post: { boardType: 'STORY', slug: 's1' } }),
    ).toBe('/community/stories/s1')
  })

  it('어드민 글이동 잠재 케이스: LIFE2 글을 stories URL로 → life2 정본', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 's1', post: { boardType: 'LIFE2', slug: 's1' } }),
    ).toBe('/community/life2/s1')
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'humor', postId: 'h1', post: { boardType: 'HUMOR', slug: 'h1' } }),
    ).toBeNull()
  })

  it('WEEKLY(숨김·목록 라우트 없음)는 보드 교정 제외 — 기존 동작 보존, CUID→slug만', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'w1', post: { boardType: 'WEEKLY', slug: 'w1' } }),
    ).toBeNull()
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'cmW', post: { boardType: 'WEEKLY', slug: 'w1' } }),
    ).toBe('/community/stories/w1')
  })

  it('MAGAZINE/JOB boardType은 보드 교정 제외 (기존 동작 보존)', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'm1', post: { boardType: 'MAGAZINE', slug: 'm1' } }),
    ).toBeNull()
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'j1', post: { boardType: 'JOB', slug: null } }),
    ).toBeNull()
  })

  it('slug 없는 글: CUID 유지, 보드 불일치만 교정', () => {
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'cmX', post: { boardType: 'MENOPAUSE', slug: null } }),
    ).toBe('/community/menopause/cmX')
    expect(
      resolveCommunityCanonicalPath({ boardSlug: 'stories', postId: 'cmX', post: { boardType: 'STORY', slug: null } }),
    ).toBeNull()
  })
})
