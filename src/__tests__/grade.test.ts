import { describe, it, expect, vi, beforeEach } from 'vitest'

// Prisma mock
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { checkAndPromote, GRADE_INFO } from '@/lib/grade'
import { prisma } from '@/lib/prisma'

const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockUpdate = vi.mocked(prisma.user.update)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GRADE_INFO', () => {
  it('4개 등급 모두 emoji + label 존재', () => {
    const grades = ['SPROUT', 'REGULAR', 'VETERAN', 'WARM_NEIGHBOR'] as const
    for (const g of grades) {
      expect(GRADE_INFO[g].emoji).toBeDefined()
      expect(GRADE_INFO[g].label).toBeDefined()
    }
  })
})

describe('checkAndPromote', () => {
  it('유저가 없으면 null 반환', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await checkAndPromote('nonexistent')
    expect(result).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  describe('SPROUT → REGULAR 승급', () => {
    it('게시글 5개 이상이면 REGULAR 승급', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'SPROUT',
        postCount: 5,
        commentCount: 0,
        receivedLikes: 0,
      } as never)
      mockUpdate.mockResolvedValue({} as never)

      const result = await checkAndPromote('user1')
      expect(result).toBe('REGULAR')
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { grade: 'REGULAR' },
      })
    })

    it('댓글 20개 이상이면 REGULAR 승급', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'SPROUT',
        postCount: 0,
        commentCount: 20,
        receivedLikes: 0,
      } as never)
      mockUpdate.mockResolvedValue({} as never)

      const result = await checkAndPromote('user1')
      expect(result).toBe('REGULAR')
    })

    it('조건 미달이면 승급 안 됨', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'SPROUT',
        postCount: 4,
        commentCount: 19,
        receivedLikes: 0,
      } as never)

      const result = await checkAndPromote('user1')
      expect(result).toBeNull()
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('REGULAR → VETERAN 승급', () => {
    it('게시글 20개 + 좋아요 100개 이상이면 VETERAN 승급', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'REGULAR',
        postCount: 20,
        commentCount: 50,
        receivedLikes: 100,
      } as never)
      mockUpdate.mockResolvedValue({} as never)

      const result = await checkAndPromote('user1')
      expect(result).toBe('VETERAN')
    })

    it('게시글만 충족하면 승급 안 됨 (AND 조건)', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'REGULAR',
        postCount: 20,
        commentCount: 50,
        receivedLikes: 99,
      } as never)

      const result = await checkAndPromote('user1')
      expect(result).toBeNull()
    })

    it('좋아요만 충족하면 승급 안 됨 (AND 조건)', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'REGULAR',
        postCount: 19,
        commentCount: 50,
        receivedLikes: 100,
      } as never)

      const result = await checkAndPromote('user1')
      expect(result).toBeNull()
    })
  })

  describe('VETERAN/WARM_NEIGHBOR는 자동 승급 없음', () => {
    it('VETERAN은 자동 승급 경로 없음', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'VETERAN',
        postCount: 100,
        commentCount: 500,
        receivedLikes: 1000,
      } as never)

      const result = await checkAndPromote('user1')
      expect(result).toBeNull()
    })

    it('WARM_NEIGHBOR는 PO 수동 부여만 가능', async () => {
      mockFindUnique.mockResolvedValue({
        grade: 'WARM_NEIGHBOR',
        postCount: 100,
        commentCount: 500,
        receivedLikes: 1000,
      } as never)

      const result = await checkAndPromote('user1')
      expect(result).toBeNull()
    })
  })
})
