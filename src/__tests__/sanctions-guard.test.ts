import { describe, it, expect, vi, beforeEach } from 'vitest'

// 실제 server action(createPost/createComment)을 직접 호출해
// 제재 가드가 작동하는지(차단 시 DB write 미도달) 통합 검증한다.

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    post: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    comment: { create: vi.fn(), findUnique: vi.fn() },
    boardConfig: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { createPost } from '@/lib/actions/posts'
import { createComment } from '@/lib/actions/comments'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.mocked(auth)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockPostCreate = vi.mocked(prisma.post.create)
const mockCommentCreate = vi.mocked(prisma.comment.create)

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPost — 제재 가드 통합', () => {
  it('BANNED 유저: 차단 메시지 반환 + post.create 절대 미호출', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'banned1' } } as never)
    mockUserFind.mockResolvedValue({ status: 'BANNED', suspendedUntil: null } as never)

    const r = await createPost(new FormData())

    expect(r.error).toBe('계정이 영구 차단되어 글을 작성할 수 없습니다.')
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('SUSPENDED(기간 내) 유저: 정지 메시지 + post.create 미호출', async () => {
    mockAuth.mockResolvedValue({ user: { id: 's1' } } as never)
    mockUserFind.mockResolvedValue({
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() + 7 * DAY),
    } as never)

    const r = await createPost(new FormData())

    expect(r.error).toContain('정지')
    expect(r.error).toContain('글을 작성할 수 없습니다.')
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('ACTIVE 유저: 가드 통과 → 이후 유효성 단계 진입(필수항목 에러)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1' } } as never)
    mockUserFind.mockResolvedValue({ status: 'ACTIVE', suspendedUntil: null } as never)

    // 빈 FormData → 가드는 통과하고 그 다음 필수항목 검증에서 멈춤(=가드 통과 증거)
    const r = await createPost(new FormData())

    expect(r.error).toBe('필수 항목을 모두 입력해 주세요')
    expect(mockPostCreate).not.toHaveBeenCalled()
  })
})

describe('createComment — 제재 가드 통합', () => {
  it('BANNED 유저: 차단 메시지 + comment.create 절대 미호출', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'banned1' } } as never)
    mockUserFind.mockResolvedValue({ status: 'BANNED', suspendedUntil: null } as never)

    const r = await createComment('post1', '정상적인 댓글 내용입니다')

    expect(r.error).toBe('계정이 영구 차단되어 글을 작성할 수 없습니다.')
    expect(mockCommentCreate).not.toHaveBeenCalled()
  })

  it('SUSPENDED(기간 내) 유저: 정지 메시지 + comment.create 미호출', async () => {
    mockAuth.mockResolvedValue({ user: { id: 's1' } } as never)
    mockUserFind.mockResolvedValue({
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() + 3 * DAY),
    } as never)

    const r = await createComment('post1', '정상적인 댓글 내용입니다')

    expect(r.error).toContain('정지')
    expect(mockCommentCreate).not.toHaveBeenCalled()
  })

  it('ACTIVE 유저: 가드 통과 → 빈 내용 검증 단계 진입', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1' } } as never)
    mockUserFind.mockResolvedValue({ status: 'ACTIVE', suspendedUntil: null } as never)

    // 공백 내용 → 가드 통과 후 "댓글 내용을 입력해 주세요"에서 멈춤(=가드 통과 증거)
    const r = await createComment('post1', '   ')

    expect(r.error).toBe('댓글 내용을 입력해 주세요')
    expect(mockCommentCreate).not.toHaveBeenCalled()
  })
})
