import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bannedWord: {
      findMany: vi.fn(),
    },
  },
}))

import { checkBannedWords } from '@/lib/banned-words'
import { prisma } from '@/lib/prisma'

const mockFindMany = vi.mocked(prisma.bannedWord.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkBannedWords', () => {
  // 주의: 내부 캐시(5분)로 인해 첫 테스트의 mock 데이터가 이후에도 재사용됨
  // 따라서 첫 테스트에서 설정한 금지어 목록이 이후 테스트에도 적용됨

  it('금지어가 포함되면 해당 단어 반환', async () => {
    mockFindMany.mockResolvedValue([
      { id: '1', word: '욕설', category: 'PROFANITY', isActive: true, createdAt: new Date() },
      { id: '2', word: '스팸', category: 'SPAM', isActive: true, createdAt: new Date() },
      { id: '3', word: 'spam', category: 'SPAM', isActive: true, createdAt: new Date() },
    ])

    const result = await checkBannedWords('이것은 욕설이 포함된 텍스트')
    expect(result).toBe('욕설')
  })

  it('금지어가 없으면 null 반환', async () => {
    // 캐시에서 이전 mock 데이터 사용됨
    const result = await checkBannedWords('정상적인 텍스트입니다')
    expect(result).toBeNull()
  })

  it('대소문자 구분 없이 검사', async () => {
    // 캐시에서 이전 mock 데이터 사용됨 (spam 포함)
    const result = await checkBannedWords('This is SPAM content')
    expect(result).toBe('spam')
  })
})
