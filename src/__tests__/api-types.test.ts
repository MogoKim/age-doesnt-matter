import { describe, it, expect } from 'vitest'
import {
  GRADE_ORDER,
  GRADE_EMOJI,
  GRADE_LABEL,
  BOARD_SLUG_MAP,
  BOARD_TYPE_TO_SLUG,
} from '@/types/api'
import type { Grade, BoardType } from '@/types/api'

describe('등급 시스템', () => {
  it('등급 순서: SPROUT < REGULAR < VETERAN < WARM_NEIGHBOR', () => {
    expect(GRADE_ORDER.SPROUT).toBeLessThan(GRADE_ORDER.REGULAR)
    expect(GRADE_ORDER.REGULAR).toBeLessThan(GRADE_ORDER.VETERAN)
    expect(GRADE_ORDER.VETERAN).toBeLessThan(GRADE_ORDER.WARM_NEIGHBOR)
  })

  it('4개 등급 모두 이모지 존재', () => {
    const grades: Grade[] = ['SPROUT', 'REGULAR', 'VETERAN', 'WARM_NEIGHBOR']
    for (const g of grades) {
      expect(GRADE_EMOJI[g]).toBeDefined()
      expect(GRADE_EMOJI[g].length).toBeGreaterThan(0)
    }
  })

  it('4개 등급 모두 라벨 존재', () => {
    expect(GRADE_LABEL.SPROUT).toBe('새싹')
    expect(GRADE_LABEL.REGULAR).toBe('단골')
    expect(GRADE_LABEL.VETERAN).toBe('터줏대감')
    expect(GRADE_LABEL.WARM_NEIGHBOR).toBe('따뜻한이웃')
  })
})

describe('게시판 slug ↔ BoardType 매핑', () => {
  it('slug → BoardType 변환', () => {
    expect(BOARD_SLUG_MAP.stories).toBe('STORY')
    expect(BOARD_SLUG_MAP.humor).toBe('HUMOR')
    expect(BOARD_SLUG_MAP.magazine).toBe('MAGAZINE')
    expect(BOARD_SLUG_MAP.jobs).toBe('JOB')
    expect(BOARD_SLUG_MAP.weekly).toBe('WEEKLY')
  })

  it('BoardType → slug 변환', () => {
    expect(BOARD_TYPE_TO_SLUG.STORY).toBe('stories')
    expect(BOARD_TYPE_TO_SLUG.HUMOR).toBe('humor')
    expect(BOARD_TYPE_TO_SLUG.MAGAZINE).toBe('magazine')
    expect(BOARD_TYPE_TO_SLUG.JOB).toBe('jobs')
    expect(BOARD_TYPE_TO_SLUG.WEEKLY).toBe('weekly')
  })

  it('양방향 매핑 일관성: slug→type→slug 왕복', () => {
    const slugs = Object.keys(BOARD_SLUG_MAP)
    for (const slug of slugs) {
      const boardType = BOARD_SLUG_MAP[slug] as BoardType
      expect(BOARD_TYPE_TO_SLUG[boardType]).toBe(slug)
    }
  })

  it('존재하지 않는 slug는 undefined', () => {
    expect(BOARD_SLUG_MAP['nonexistent']).toBeUndefined()
  })
})
