import { describe, it, expect } from 'vitest'
import {
  BOARD_REGISTRY,
  BOARD_SLUG_TO_TYPE,
  BOARD_TYPE_TO_SLUG_MAP,
  BOARD_URL_PREFIX,
  COMMUNITY_SITEMAP_SLUGS,
  ACTIVE_COMMUNITY_BOARD_TYPES,
  ACTIVE_COMMUNITY_BOARD_SLUG,
  ACTIVE_COMMUNITY_LIST_PATHS,
} from '../lib/board-registry'
import { BOARD_SLUG_MAP, BOARD_TYPE_TO_SLUG } from '../types/api'
import { BOARD_URL_PREFIX as NOTIFICATION_BOARD_URL_PREFIX } from '../lib/notifications/link'

/**
 * PR-0 동작 불변 스냅샷 — 아래 기대값은 리팩토링 **이전** 각 파일에 흩어져 있던
 * 리터럴을 그대로 박제한 것이다. registry 파생 결과가 1글자라도 다르면 FAIL.
 * (새 보드 추가 시에는 이 스냅샷도 의도적으로 함께 갱신한다)
 */

// 구 src/types/api.ts BOARD_SLUG_MAP 리터럴
const BEFORE_SLUG_MAP = {
  stories: 'STORY',
  humor: 'HUMOR',
  magazine: 'MAGAZINE',
  jobs: 'JOB',
  weekly: 'WEEKLY',
  life2: 'LIFE2',
}

// 구 src/types/api.ts BOARD_TYPE_TO_SLUG 리터럴
const BEFORE_TYPE_TO_SLUG = {
  STORY: 'stories',
  HUMOR: 'humor',
  MAGAZINE: 'magazine',
  JOB: 'jobs',
  WEEKLY: 'weekly',
  LIFE2: 'life2',
}

// 구 notifications/link.ts·queries/home.ts BOARD_URL_PREFIX = 구 admin×4·revalidate-deleted BOARD_PATHS 리터럴 (완전 동일했음)
const BEFORE_URL_PREFIX = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  WEEKLY: '/community/weekly',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
}

describe('board-registry — PR-0 동작 불변 스냅샷', () => {
  it('BOARD_SLUG_TO_TYPE = 구 BOARD_SLUG_MAP 리터럴과 동일', () => {
    expect(BOARD_SLUG_TO_TYPE).toEqual(BEFORE_SLUG_MAP)
  })

  it('BOARD_TYPE_TO_SLUG_MAP = 구 BOARD_TYPE_TO_SLUG 리터럴과 동일', () => {
    expect(BOARD_TYPE_TO_SLUG_MAP).toEqual(BEFORE_TYPE_TO_SLUG)
  })

  it('BOARD_URL_PREFIX = 구 BOARD_URL_PREFIX/BOARD_PATHS 리터럴과 동일', () => {
    expect(BOARD_URL_PREFIX).toEqual(BEFORE_URL_PREFIX)
  })

  it('api.ts 공개 export가 registry 파생값과 동일 (하위 호환)', () => {
    expect(BOARD_SLUG_MAP).toEqual(BEFORE_SLUG_MAP)
    expect(BOARD_TYPE_TO_SLUG).toEqual(BEFORE_TYPE_TO_SLUG)
  })

  it('notifications/link.ts BOARD_URL_PREFIX export 하위 호환', () => {
    expect(NOTIFICATION_BOARD_URL_PREFIX).toEqual(BEFORE_URL_PREFIX)
  })

  it('sitemap 커뮤니티 목록 slug = 구 BOARD_SLUGS 리터럴 순서 포함 동일', () => {
    expect(COMMUNITY_SITEMAP_SLUGS).toEqual(['stories', 'humor', 'life2'])
  })

  it('prewarm 파생값 = 구 리터럴과 동일 (쿼리 대상·slug 맵·목록 경로)', () => {
    expect(ACTIVE_COMMUNITY_BOARD_TYPES).toEqual(['STORY', 'HUMOR', 'LIFE2'])
    expect(ACTIVE_COMMUNITY_BOARD_SLUG).toEqual({ STORY: 'stories', HUMOR: 'humor', LIFE2: 'life2' })
    expect(ACTIVE_COMMUNITY_LIST_PATHS).toEqual(['/community/stories', '/community/humor', '/community/life2'])
  })

  it('registry 무결성: type/slug 중복 없음 + 커뮤니티 urlPrefix 규칙', () => {
    const types = BOARD_REGISTRY.map((b) => b.type)
    const slugs = BOARD_REGISTRY.map((b) => b.slug)
    expect(new Set(types).size).toBe(types.length)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const b of BOARD_REGISTRY) {
      expect(b.urlPrefix).toBe(b.isCommunity ? `/community/${b.slug}` : `/${b.slug}`)
    }
  })

  it('WEEKLY(숨김)는 sitemap/prewarm에서 제외 유지', () => {
    expect(COMMUNITY_SITEMAP_SLUGS).not.toContain('weekly')
    expect(ACTIVE_COMMUNITY_LIST_PATHS).not.toContain('/community/weekly')
  })
})
