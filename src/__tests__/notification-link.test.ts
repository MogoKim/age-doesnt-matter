import { describe, it, expect } from 'vitest'
import { buildNotificationLinkUrl } from '@/lib/notifications/link'

describe('buildNotificationLinkUrl — 알림 이동 URL(slug canonical로 리다이렉트 제거)', () => {
  it('저장된 linkUrl(공지 등)이 최우선', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: '/best', postId: 'cuid1', boardType: 'STORY', slug: 'my-slug' }),
    ).toBe('/best')
  })

  it('STORY + slug 있음 → /community/stories/{slug} (CUID 아님, 리다이렉트 제거)', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: 'cmxxxx', boardType: 'STORY', slug: '실버-사업-한다면' }),
    ).toBe('/community/stories/실버-사업-한다면')
  })

  it('HUMOR/LIFE2 + slug → 각 보드 prefix + slug', () => {
    expect(buildNotificationLinkUrl({ linkUrl: null, postId: 'c1', boardType: 'HUMOR', slug: 's1' })).toBe('/community/humor/s1')
    expect(buildNotificationLinkUrl({ linkUrl: null, postId: 'c1', boardType: 'LIFE2', slug: 's2' })).toBe('/community/life2/s2')
  })

  it('slug 없음(null) → 기존 CUID fallback', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: 'cmCUID', boardType: 'STORY', slug: null }),
    ).toBe('/community/stories/cmCUID')
  })

  it('JOB(항상 slug null) → /jobs/{CUID} 유지 (jobs 라우트는 CUID 기반)', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: 'jobcuid', boardType: 'JOB', slug: null }),
    ).toBe('/jobs/jobcuid')
  })

  it('MAGAZINE + slug → /magazine/{slug}', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: 'c', boardType: 'MAGAZINE', slug: 'mag-slug' }),
    ).toBe('/magazine/mag-slug')
  })

  it('boardType 미상 + slug → /community/stories/{slug} fallback prefix', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: 'c', boardType: null, slug: 'sx' }),
    ).toBe('/community/stories/sx')
  })

  it('postId 없음 → 알림 목록', () => {
    expect(
      buildNotificationLinkUrl({ linkUrl: null, postId: null, boardType: null, slug: null }),
    ).toBe('/my/notifications')
  })
})
