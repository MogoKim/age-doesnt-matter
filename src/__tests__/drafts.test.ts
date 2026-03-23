import { describe, it, expect, vi, beforeEach } from 'vitest'

// auth mock
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// prisma mock
vi.mock('@/lib/prisma', () => ({
  prisma: {
    draftPost: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { saveDraft, deleteDraft, getMyDrafts } from '@/lib/actions/drafts'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.mocked(auth)
const mockCount = vi.mocked(prisma.draftPost.count)
const mockCreate = vi.mocked(prisma.draftPost.create)
const mockUpdate = vi.mocked(prisma.draftPost.update)
const mockDelete = vi.mocked(prisma.draftPost.delete)
const mockFindUnique = vi.mocked(prisma.draftPost.findUnique)
const mockFindMany = vi.mocked(prisma.draftPost.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveDraft', () => {
  it('미로그인 시 에러 반환', async () => {
    mockAuth.mockResolvedValue(null as never)

    const formData = new FormData()
    formData.set('title', '테스트')
    const result = await saveDraft(null, formData)
    expect(result.error).toBe('로그인이 필요합니다')
  })

  it('새 임시저장 생성', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as never)
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({ id: 'draft1' } as never)

    const formData = new FormData()
    formData.set('boardSlug', 'stories')
    formData.set('title', '임시 제목')
    formData.set('content', '임시 본문')

    const result = await saveDraft(null, formData)
    expect(result.draftId).toBe('draft1')
    expect(mockCreate).toHaveBeenCalled()
  })

  it('기존 임시저장 업데이트', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as never)
    mockFindUnique.mockResolvedValue({ authorId: 'user1' } as never)
    mockUpdate.mockResolvedValue({} as never)

    const formData = new FormData()
    formData.set('title', '수정된 제목')

    const result = await saveDraft('existing-draft', formData)
    expect(result.draftId).toBe('existing-draft')
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('다른 유저의 임시저장은 수정 불가', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as never)
    mockFindUnique.mockResolvedValue({ authorId: 'other-user' } as never)

    const formData = new FormData()
    formData.set('title', '수정')

    const result = await saveDraft('other-draft', formData)
    expect(result.error).toBe('임시저장을 찾을 수 없습니다')
  })
})

describe('deleteDraft', () => {
  it('미로그인 시 에러 반환', async () => {
    mockAuth.mockResolvedValue(null as never)
    const result = await deleteDraft('draft1')
    expect(result.error).toBe('로그인이 필요합니다')
  })

  it('본인 임시저장 삭제 성공', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as never)
    mockFindUnique.mockResolvedValue({ authorId: 'user1' } as never)
    mockDelete.mockResolvedValue({} as never)

    const result = await deleteDraft('draft1')
    expect(result.error).toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'draft1' } })
  })
})

describe('getMyDrafts', () => {
  it('미로그인 시 빈 배열 반환', async () => {
    mockAuth.mockResolvedValue(null as never)
    const result = await getMyDrafts()
    expect(result).toEqual([])
  })

  it('로그인 시 임시저장 목록 반환', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } } as never)
    const mockDrafts = [
      { id: 'd1', boardSlug: 'stories', category: null, title: '제목1', updatedAt: new Date() },
    ]
    mockFindMany.mockResolvedValue(mockDrafts as never)

    const result = await getMyDrafts()
    expect(result).toEqual(mockDrafts)
  })
})
