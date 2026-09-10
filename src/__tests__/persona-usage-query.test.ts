import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { post: { groupBy: vi.fn(), findMany: vi.fn() } },
}))

import { getPersonaRecentUsage } from '@/lib/queries/admin/admin.persona-usage'
import { prisma } from '@/lib/prisma'

const mockGroupBy = vi.mocked(prisma.post.groupBy)
const mockFindMany = vi.mocked(prisma.post.findMany)

const T1 = new Date('2026-09-01T10:00:00.000Z')
const T2 = new Date('2026-09-08T10:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getPersonaRecentUsage — 배치 조회 (N+1 없음)', () => {
  it('계정이 없으면 쿼리를 아예 날리지 않는다', async () => {
    const r = await getPersonaRecentUsage([])

    expect(r.size).toBe(0)
    expect(mockGroupBy).not.toHaveBeenCalled()
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('계정이 많아도 쿼리는 2개다', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `u${i}`)
    mockGroupBy.mockResolvedValue(
      ids.map((id) => ({ authorId: id, _max: { publishedAt: T1 } })) as never,
    )
    mockFindMany.mockResolvedValue(
      ids.map((id) => ({
        authorId: id,
        title: `제목 ${id}`,
        boardType: 'STORY',
        publishedAt: T1,
      })) as never,
    )

    const r = await getPersonaRecentUsage(ids)

    expect(mockGroupBy).toHaveBeenCalledTimes(1)
    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(r.size).toBe(50)
  })

  it('계정별 최근 공개 시각·제목·게시판을 매핑한다', async () => {
    mockGroupBy.mockResolvedValue([
      { authorId: 'u1', _max: { publishedAt: T1 } },
      { authorId: 'u2', _max: { publishedAt: T2 } },
    ] as never)
    mockFindMany.mockResolvedValue([
      { authorId: 'u2', title: '두번째 글', boardType: 'HUMOR', publishedAt: T2 },
      { authorId: 'u1', title: '첫번째 글', boardType: 'STORY', publishedAt: T1 },
    ] as never)

    const r = await getPersonaRecentUsage(['u1', 'u2', 'u3'])

    expect(r.get('u1')).toEqual({ lastPostedAt: T1, lastTitle: '첫번째 글', lastBoardType: 'STORY' })
    expect(r.get('u2')).toEqual({ lastPostedAt: T2, lastTitle: '두번째 글', lastBoardType: 'HUMOR' })
    // 공개 글이 없는 계정은 아예 map에 없다 → 화면에서 "공개 글 없음"
    expect(r.get('u3')).toBeUndefined()
  })

  it('1번 쿼리는 PUBLISHED · publishedAt not null 만 본다', async () => {
    mockGroupBy.mockResolvedValue([] as never)

    await getPersonaRecentUsage(['u1'])

    const args = mockGroupBy.mock.calls[0][0] as {
      by: string[]
      where: Record<string, unknown>
      _max: Record<string, boolean>
    }
    expect(args.by).toEqual(['authorId'])
    expect(args.where.status).toBe('PUBLISHED')
    expect(args.where.publishedAt).toEqual({ not: null })
    expect(args.where.authorId).toEqual({ in: ['u1'] })
    // 작성 시각이 아니라 공개 시각 기준
    expect(args._max.publishedAt).toBe(true)
    expect(args._max.createdAt).toBeUndefined()
  })

  it('2번 쿼리에도 PUBLISHED 조건이 들어가고, 1번의 (authorId, publishedAt) 쌍만 조회한다', async () => {
    mockGroupBy.mockResolvedValue([
      { authorId: 'u1', _max: { publishedAt: T1 } },
      { authorId: 'u2', _max: { publishedAt: T2 } },
    ] as never)
    mockFindMany.mockResolvedValue([] as never)

    await getPersonaRecentUsage(['u1', 'u2'])

    const args = mockFindMany.mock.calls[0][0] as {
      where: { status: string; OR: unknown[] }
    }
    expect(args.where.status).toBe('PUBLISHED')
    expect(args.where.OR).toEqual([
      { authorId: 'u1', publishedAt: T1 },
      { authorId: 'u2', publishedAt: T2 },
    ])
  })

  it('_max.publishedAt이 null인 행은 건너뛴다', async () => {
    mockGroupBy.mockResolvedValue([{ authorId: 'u1', _max: { publishedAt: null } }] as never)

    const r = await getPersonaRecentUsage(['u1'])

    expect(r.size).toBe(0)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('시각은 있는데 2번 조회에서 글을 못 찾으면 제목은 null로 남는다', async () => {
    mockGroupBy.mockResolvedValue([{ authorId: 'u1', _max: { publishedAt: T1 } }] as never)
    mockFindMany.mockResolvedValue([] as never)

    const r = await getPersonaRecentUsage(['u1'])

    expect(r.get('u1')).toEqual({ lastPostedAt: T1, lastTitle: null, lastBoardType: null })
  })
})
