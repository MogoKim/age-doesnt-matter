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

  it('계정이 289개여도 쿼리는 2개다', async () => {
    const ids = Array.from({ length: 289 }, (_, i) => `u${i}`)
    mockGroupBy.mockResolvedValue(
      ids.map((id) => ({ authorId: id, _max: { createdAt: T1 } })) as never,
    )
    mockFindMany.mockResolvedValue(
      ids.map((id) => ({ authorId: id, title: `제목 ${id}`, boardType: 'STORY', createdAt: T1 })) as never,
    )

    const r = await getPersonaRecentUsage(ids)

    expect(mockGroupBy).toHaveBeenCalledTimes(1)
    expect(mockFindMany).toHaveBeenCalledTimes(1)
    expect(r.size).toBe(289)
  })

  it('계정별 최근 발행 시각·제목·게시판을 매핑한다', async () => {
    mockGroupBy.mockResolvedValue([
      { authorId: 'u1', _max: { createdAt: T1 } },
      { authorId: 'u2', _max: { createdAt: T2 } },
    ] as never)
    mockFindMany.mockResolvedValue([
      { authorId: 'u2', title: '두번째 글', boardType: 'HUMOR', createdAt: T2 },
      { authorId: 'u1', title: '첫번째 글', boardType: 'STORY', createdAt: T1 },
    ] as never)

    const r = await getPersonaRecentUsage(['u1', 'u2', 'u3'])

    expect(r.get('u1')).toEqual({ lastPostedAt: T1, lastTitle: '첫번째 글', lastBoardType: 'STORY' })
    expect(r.get('u2')).toEqual({ lastPostedAt: T2, lastTitle: '두번째 글', lastBoardType: 'HUMOR' })
    // 글을 쓴 적 없는 계정은 아예 map에 없다 → 화면에서 "발행 기록 없음"
    expect(r.get('u3')).toBeUndefined()
  })

  it('DELETED 글은 제외하고 조회한다', async () => {
    mockGroupBy.mockResolvedValue([] as never)

    await getPersonaRecentUsage(['u1'])

    const where = mockGroupBy.mock.calls[0][0].where as Record<string, unknown>
    expect(where.status).toEqual({ not: 'DELETED' })
    expect(where.authorId).toEqual({ in: ['u1'] })
  })

  it('2번 쿼리는 1번에서 나온 (authorId, createdAt) 쌍만 조회한다', async () => {
    mockGroupBy.mockResolvedValue([
      { authorId: 'u1', _max: { createdAt: T1 } },
      { authorId: 'u2', _max: { createdAt: T2 } },
    ] as never)
    mockFindMany.mockResolvedValue([] as never)

    await getPersonaRecentUsage(['u1', 'u2'])

    const args = mockFindMany.mock.calls[0][0] as { where: { OR: unknown[] } }
    const where = args.where
    expect(where.OR).toEqual([
      { authorId: 'u1', createdAt: T1 },
      { authorId: 'u2', createdAt: T2 },
    ])
  })

  it('_max.createdAt이 null인 행은 건너뛴다', async () => {
    mockGroupBy.mockResolvedValue([{ authorId: 'u1', _max: { createdAt: null } }] as never)

    const r = await getPersonaRecentUsage(['u1'])

    expect(r.size).toBe(0)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('시각은 있는데 2번 조회에서 글을 못 찾으면 제목은 null로 남는다', async () => {
    mockGroupBy.mockResolvedValue([{ authorId: 'u1', _max: { createdAt: T1 } }] as never)
    mockFindMany.mockResolvedValue([] as never)

    const r = await getPersonaRecentUsage(['u1'])

    expect(r.get('u1')).toEqual({ lastPostedAt: T1, lastTitle: null, lastBoardType: null })
  })
})
