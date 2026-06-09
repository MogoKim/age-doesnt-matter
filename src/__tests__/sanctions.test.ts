import { describe, it, expect, vi, beforeEach } from 'vitest'

// prisma mock
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { getWriteBlockReason } from '@/lib/sanctions'
import { prisma } from '@/lib/prisma'

const mockFindUnique = vi.mocked(prisma.user.findUnique)

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getWriteBlockReason', () => {
  it('ACTIVE 유저는 통과(null)', async () => {
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE', suspendedUntil: null } as never)
    expect(await getWriteBlockReason('u1')).toBeNull()
  })

  it('BANNED 유저는 영구 차단 메시지', async () => {
    mockFindUnique.mockResolvedValue({ status: 'BANNED', suspendedUntil: null } as never)
    const r = await getWriteBlockReason('u2')
    expect(r).toBe('계정이 영구 차단되어 글을 작성할 수 없습니다.')
  })

  it('SUSPENDED + 정지기간이 미래면 차단 메시지(만료일 포함)', async () => {
    const until = new Date(Date.now() + 7 * DAY)
    mockFindUnique.mockResolvedValue({ status: 'SUSPENDED', suspendedUntil: until } as never)
    const r = await getWriteBlockReason('u3')
    expect(r).not.toBeNull()
    expect(r).toContain('계정이 정지되어')
    expect(r).toContain('글을 작성할 수 없습니다.')
  })

  it('SUSPENDED + 정지기간이 이미 만료됐으면 통과(null) — 작성 허용', async () => {
    const until = new Date(Date.now() - 1 * DAY)
    mockFindUnique.mockResolvedValue({ status: 'SUSPENDED', suspendedUntil: until } as never)
    expect(await getWriteBlockReason('u4')).toBeNull()
  })

  it('SUSPENDED인데 suspendedUntil이 null이면 통과(null) — 안전 기본값', async () => {
    mockFindUnique.mockResolvedValue({ status: 'SUSPENDED', suspendedUntil: null } as never)
    expect(await getWriteBlockReason('u5')).toBeNull()
  })

  it('유저가 존재하지 않으면 통과(null)', async () => {
    mockFindUnique.mockResolvedValue(null as never)
    expect(await getWriteBlockReason('nope')).toBeNull()
  })

  it('status/suspendedUntil 두 필드만 조회한다(과조회 방지)', async () => {
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE', suspendedUntil: null } as never)
    await getWriteBlockReason('u1')
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { status: true, suspendedUntil: true },
    })
  })
})
