import { describe, it, expect } from 'vitest'
import { shouldGoogleNoindexCommunityPost, type CommunityGoogleNoindexInput } from '@/lib/seo/community-google-noindex'

const NOW = new Date('2026-07-28T00:00:00Z')
const OLD = new Date('2026-07-01T00:00:00Z')   // 27일 전 → 14일 경과
const FRESH = new Date('2026-07-25T00:00:00Z') // 3일 전 → 유예

/** 기본값 = noindex 대상(모든 조건 충족). 각 테스트에서 한 축만 바꿔 보호 여부를 본다. */
function post(overrides: Partial<CommunityGoogleNoindexInput> = {}): CommunityGoogleNoindexInput {
  return {
    boardType: 'STORY',
    content: '<p>짧은 글입니다.</p>',
    commentCount: 0,
    seoTitle: null,
    seoDescription: null,
    createdAt: OLD,
    ...overrides,
  }
}

describe('shouldGoogleNoindexCommunityPost — 구글 전용 저품질 색인 제외 (PR-B1)', () => {
  it('모든 조건 충족 → true (STORY/짧음/댓글0/메타없음/14일+)', () => {
    expect(shouldGoogleNoindexCommunityPost(post(), NOW)).toBe(true)
  })

  it('글 단위 판단 대상 보드 2종 적용', () => {
    for (const boardType of ['STORY', 'LIFE2']) {
      expect(shouldGoogleNoindexCommunityPost(post({ boardType }), NOW), boardType).toBe(true)
    }
  })

  it('MENOPAUSE는 전면 보호 → false', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ boardType: 'MENOPAUSE' }), NOW)).toBe(false)
  })

  it('MAGAZINE/JOB/기타 보드 보호 → false', () => {
    for (const boardType of ['MAGAZINE', 'JOB', 'WEEKLY', 'UNKNOWN']) {
      expect(shouldGoogleNoindexCommunityPost(post({ boardType }), NOW), boardType).toBe(false)
    }
  })

  it('댓글 1개 이상이면 보호', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ commentCount: 1 }), NOW)).toBe(false)
    expect(shouldGoogleNoindexCommunityPost(post({ commentCount: 12 }), NOW)).toBe(false)
  })

  it('본문 300자 이상이면 보호 (HTML 태그 제외한 실제 텍스트 기준)', () => {
    const long = `<p>${'가'.repeat(300)}</p>`
    expect(shouldGoogleNoindexCommunityPost(post({ content: long }), NOW)).toBe(false)
    const justUnder = `<p>${'가'.repeat(299)}</p>`
    expect(shouldGoogleNoindexCommunityPost(post({ content: justUnder }), NOW)).toBe(true)
  })

  it('태그만 길고 텍스트가 짧으면 대상 (태그는 길이에서 제외)', () => {
    const tagHeavy = `<div class="${'x'.repeat(400)}"><p>짧다</p></div>`
    expect(shouldGoogleNoindexCommunityPost(post({ content: tagHeavy }), NOW)).toBe(true)
  })

  it('seoTitle·seoDescription 둘 다 있으면 보호 / 하나만 있으면 대상', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ seoTitle: 'T', seoDescription: 'D' }), NOW)).toBe(false)
    expect(shouldGoogleNoindexCommunityPost(post({ seoTitle: 'T', seoDescription: null }), NOW)).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(post({ seoTitle: null, seoDescription: 'D' }), NOW)).toBe(true)
  })

  it('작성 14일 미만은 유예 → 보호', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ createdAt: FRESH }), NOW)).toBe(false)
  })

  it('경계: 정확히 14일 경과면 대상, 13.9일이면 보호', () => {
    const exactly14 = new Date(NOW.getTime() - 14 * 24 * 3600_000)
    const almost14 = new Date(NOW.getTime() - 13.9 * 24 * 3600_000)
    expect(shouldGoogleNoindexCommunityPost(post({ createdAt: exactly14 }), NOW)).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(post({ createdAt: almost14 }), NOW)).toBe(false)
  })

  it('createdAt 문자열(직렬화본)도 동작', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ createdAt: OLD.toISOString() }), NOW)).toBe(true)
  })

  it('createdAt 파싱 실패 시 보호(안전측)', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ createdAt: 'not-a-date' }), NOW)).toBe(false)
  })

  it('content null/빈 문자열은 길이 0 → 대상', () => {
    expect(shouldGoogleNoindexCommunityPost(post({ content: null }), NOW)).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(post({ content: '' }), NOW)).toBe(true)
  })
})

describe('shouldGoogleNoindexCommunityPost — HUMOR 보드 전면 제외 (PR-B2)', () => {
  const humor = (o: Partial<CommunityGoogleNoindexInput> = {}) => post({ boardType: 'HUMOR', ...o })

  it('기본 HUMOR → true', () => {
    expect(shouldGoogleNoindexCommunityPost(humor(), NOW)).toBe(true)
  })

  it('본문이 길어도 true (B1 길이 조건 무시)', () => {
    expect(shouldGoogleNoindexCommunityPost(humor({ content: `<p>${'가'.repeat(3000)}</p>` }), NOW)).toBe(true)
  })

  it('댓글이 많아도 true (B1 반응 조건 무시)', () => {
    expect(shouldGoogleNoindexCommunityPost(humor({ commentCount: 50 }), NOW)).toBe(true)
  })

  it('SEO 메타가 완비돼도 true (B1 메타 조건 무시)', () => {
    expect(shouldGoogleNoindexCommunityPost(humor({ seoTitle: 'T', seoDescription: 'D' }), NOW)).toBe(true)
  })

  it('작성 14일 미만 신규 글도 true (B1 유예 무시)', () => {
    expect(shouldGoogleNoindexCommunityPost(humor({ createdAt: FRESH }), NOW)).toBe(true)
    expect(shouldGoogleNoindexCommunityPost(humor({ createdAt: NOW }), NOW)).toBe(true)
  })

  it('createdAt이 파싱 불가여도 true (보드 판정이 먼저)', () => {
    expect(shouldGoogleNoindexCommunityPost(humor({ createdAt: 'not-a-date' }), NOW)).toBe(true)
  })

  it('모든 보호 조건을 동시에 갖춘 HUMOR도 true', () => {
    expect(
      shouldGoogleNoindexCommunityPost(
        humor({
          content: `<p>${'가'.repeat(1500)}</p>`,
          commentCount: 30,
          seoTitle: 'T',
          seoDescription: 'D',
          createdAt: NOW,
        }),
        NOW,
      ),
    ).toBe(true)
  })

  it('MENOPAUSE는 B2 확대 대상이 아니다 → 조건 무관하게 false', () => {
    const menopause = (o: Partial<CommunityGoogleNoindexInput> = {}) => post({ boardType: 'MENOPAUSE', ...o })
    expect(shouldGoogleNoindexCommunityPost(menopause(), NOW)).toBe(false)
    expect(shouldGoogleNoindexCommunityPost(menopause({ content: null, commentCount: 0 }), NOW)).toBe(false)
  })

  it('STORY/LIFE2는 B2 영향 없음 — 보호 조건 하나라도 있으면 false 유지', () => {
    for (const boardType of ['STORY', 'LIFE2']) {
      expect(shouldGoogleNoindexCommunityPost(post({ boardType, commentCount: 1 }), NOW), boardType).toBe(false)
      expect(
        shouldGoogleNoindexCommunityPost(post({ boardType, content: `<p>${'가'.repeat(400)}</p>` }), NOW),
        boardType,
      ).toBe(false)
      expect(
        shouldGoogleNoindexCommunityPost(post({ boardType, seoTitle: 'T', seoDescription: 'D' }), NOW),
        boardType,
      ).toBe(false)
      expect(shouldGoogleNoindexCommunityPost(post({ boardType, createdAt: FRESH }), NOW), boardType).toBe(false)
    }
  })
})
