import { describe, expect, it } from 'vitest'
import {
  HOME_TRENDING_FALLBACK_BOARD,
  HOME_TRENDING_QUOTAS,
  HOME_TRENDING_TOTAL,
  selectHomeTrendingPosts,
  type HomeTrendingBoardType,
  type ScoredHomeTrendingPost,
} from '@/lib/home-trending-quota'

interface TestPost {
  id: string
  boardType: HomeTrendingBoardType
}

function candidates(
  boardType: HomeTrendingBoardType,
  scores: number[],
): ScoredHomeTrendingPost<TestPost>[] {
  return scores.map((score, index) => ({
    post: { id: `${boardType}-${index + 1}`, boardType },
    score,
  }))
}

describe('home trending quota', () => {
  it('갱년기톡 2 / 사는이야기 4 / 2막준비 2 / 웃음방 2 쿼터를 고정한다', () => {
    expect(HOME_TRENDING_QUOTAS.map(item => [item.boardType, item.quota])).toEqual([
      ['MENOPAUSE', 2],
      ['STORY', 4],
      ['LIFE2', 2],
      ['HUMOR', 2],
    ])
    expect(HOME_TRENDING_TOTAL).toBe(10)
    expect(HOME_TRENDING_FALLBACK_BOARD).toBe('STORY')
  })

  it('각 보드 후보가 충분하면 목표 쿼터대로 10개를 고른다', () => {
    const selected = selectHomeTrendingPosts({
      MENOPAUSE: candidates('MENOPAUSE', [100, 90, 80]),
      STORY: candidates('STORY', [70, 60, 50, 40, 30]),
      LIFE2: candidates('LIFE2', [20, 10, 5]),
      HUMOR: candidates('HUMOR', [9, 8, 7]),
    })

    expect(selected).toHaveLength(10)
    expect(countByBoard(selected)).toEqual({
      MENOPAUSE: 2,
      STORY: 4,
      LIFE2: 2,
      HUMOR: 2,
    })
  })

  it('갱년기톡/2막준비/웃음방 후보가 부족하면 사는이야기가 남은 슬롯을 채운다', () => {
    const selected = selectHomeTrendingPosts({
      MENOPAUSE: candidates('MENOPAUSE', [100]),
      STORY: candidates('STORY', [90, 80, 70, 60, 50, 40, 30, 20, 10, 5]),
      LIFE2: candidates('LIFE2', []),
      HUMOR: candidates('HUMOR', [15]),
    })

    expect(selected).toHaveLength(10)
    expect(countByBoard(selected)).toEqual({
      MENOPAUSE: 1,
      STORY: 8,
      HUMOR: 1,
    })
  })

  it('선택된 글은 최종 currentScore 내림차순으로 정렬한다', () => {
    const selected = selectHomeTrendingPosts({
      MENOPAUSE: candidates('MENOPAUSE', [30, 10]),
      STORY: candidates('STORY', [100, 90, 20, 5]),
      LIFE2: candidates('LIFE2', [80, 70]),
      HUMOR: candidates('HUMOR', [60, 50]),
    })

    expect(selected.map(post => post.id)).toEqual([
      'STORY-1',
      'STORY-2',
      'LIFE2-1',
      'LIFE2-2',
      'HUMOR-1',
      'HUMOR-2',
      'MENOPAUSE-1',
      'STORY-3',
      'MENOPAUSE-2',
      'STORY-4',
    ])
  })

  it('fallback 과정에서 같은 글을 중복 선택하지 않는다', () => {
    const selected = selectHomeTrendingPosts({
      STORY: candidates('STORY', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]),
    })

    expect(selected).toHaveLength(10)
    expect(new Set(selected.map(post => post.id)).size).toBe(10)
  })
})

function countByBoard(posts: readonly TestPost[]) {
  return posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.boardType] = (acc[post.boardType] ?? 0) + 1
    return acc
  }, {})
}
