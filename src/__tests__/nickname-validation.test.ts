import { describe, it, expect, vi, beforeEach } from 'vitest'

// Prisma mock
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

// auth mock (server action에서 사용)
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

import { checkNickname } from '@/lib/actions/onboarding'
import { prisma } from '@/lib/prisma'

const mockFindUnique = vi.mocked(prisma.user.findUnique)

beforeEach(() => {
  vi.clearAllMocks()
  mockFindUnique.mockResolvedValue(null) // 기본: 중복 없음
})

describe('checkNickname — 닉네임 검증', () => {
  describe('길이 검증', () => {
    it('1자 → 실패', async () => {
      const result = await checkNickname('가')
      expect(result.available).toBe(false)
      expect(result.error).toContain('2~10자')
    })

    it('2자 → 성공', async () => {
      const result = await checkNickname('가나')
      expect(result.available).toBe(true)
    })

    it('10자 → 성공', async () => {
      const result = await checkNickname('가나다라마바사아자차')
      expect(result.available).toBe(true)
    })

    it('11자 → 실패', async () => {
      const result = await checkNickname('가나다라마바사아자차카')
      expect(result.available).toBe(false)
    })

    it('공백 trim 후 판단', async () => {
      const result = await checkNickname('  가  ')
      expect(result.available).toBe(false) // trim 후 1자
    })
  })

  describe('문자 검증 (한글/영문/숫자만 허용)', () => {
    it('한글만 → 성공', async () => {
      const result = await checkNickname('행복한하루')
      expect(result.available).toBe(true)
    })

    it('영문만 → 성공', async () => {
      const result = await checkNickname('happy')
      expect(result.available).toBe(true)
    })

    it('숫자 포함 → 성공', async () => {
      const result = await checkNickname('유저123')
      expect(result.available).toBe(true)
    })

    it('특수문자 포함 → 실패', async () => {
      const result = await checkNickname('유저!@#')
      expect(result.available).toBe(false)
      expect(result.error).toContain('한글, 영문, 숫자만')
    })

    it('공백 포함 → 실패', async () => {
      const result = await checkNickname('유저 이름')
      expect(result.available).toBe(false)
    })

    it('이모지 포함 → 실패', async () => {
      const result = await checkNickname('유저😀')
      expect(result.available).toBe(false)
    })
  })

  describe('금지어 검증', () => {
    it('"운영자" 포함 → 실패', async () => {
      const result = await checkNickname('운영자사칭')
      expect(result.available).toBe(false)
      expect(result.error).toContain('사용할 수 없는')
    })

    it('"관리자" 포함 → 실패', async () => {
      const result = await checkNickname('관리자입니다')
      expect(result.available).toBe(false)
    })

    it('"admin" 대소문자 무시 → 실패', async () => {
      const result = await checkNickname('ADMIN')
      expect(result.available).toBe(false)
    })

    it('"어드민" 포함 → 실패', async () => {
      const result = await checkNickname('어드민닉네임')
      expect(result.available).toBe(false)
    })

    it('"관리인" 포함 → 실패', async () => {
      const result = await checkNickname('관리인역할')
      expect(result.available).toBe(false)
    })
  })

  describe('중복 검증', () => {
    it('이미 사용 중인 닉네임 → 실패', async () => {
      mockFindUnique.mockResolvedValue({ id: 'existing-user' } as never)
      const result = await checkNickname('행복한하루')
      expect(result.available).toBe(false)
      expect(result.error).toContain('이미 사용 중')
    })

    it('사용 가능한 닉네임 → 성공', async () => {
      mockFindUnique.mockResolvedValue(null)
      const result = await checkNickname('행복한하루')
      expect(result.available).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })
})
