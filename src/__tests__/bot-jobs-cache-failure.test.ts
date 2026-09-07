import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/bot/jobs — DB 생성과 캐시 무효화의 실패를 분리하는지 행동으로 검증한다.
 *
 * 무효화 실패를 바깥 catch 로 흘리면 **글은 이미 생성됐는데 500** 이 나간다.
 * 호출한 봇은 실패로 판단해 같은 공고를 다시 만들고, 그러면 중복 발행이 된다.
 * 캐시는 TTL 로 결국 갱신되므로 DB 성공 + 캐시 실패는 200 이어야 한다.
 */

const createMock = vi.fn()
const revalidateJobCreatedMock = vi.fn()
const authenticateBotMock = vi.fn()
const isBotWriteEnabledMock = vi.fn()

vi.mock('@/lib/prisma', () => ({ prisma: { post: { create: (...a: unknown[]) => createMock(...a) } } }))
vi.mock('@/lib/cache/job-cache', () => ({ revalidateJobCreated: () => revalidateJobCreatedMock() }))
vi.mock('@/lib/bot-auth', () => ({ authenticateBot: () => authenticateBotMock() }))
vi.mock('@/lib/bot-write-gate', () => ({
  isBotWriteEnabled: () => isBotWriteEnabledMock(),
  logBotWriteBlocked: vi.fn(),
  BOT_WRITE_BLOCKED_MESSAGE: 'blocked',
}))
vi.mock('@/lib/sanitize', () => ({ sanitizeHtml: (v: string) => v }))

const VALID_BODY = {
  title: '테스트 공고',
  content: '<p>본문</p>',
  company: '테스트 회사',
  authorId: 'user-1',
}

function makeReq(body: unknown = VALID_BODY) {
  return { json: async () => body } as unknown as Parameters<
    Awaited<ReturnType<typeof loadRoute>>['POST']
  >[0]
}

async function loadRoute() {
  return import('@/app/api/bot/jobs/route')
}

describe('POST /api/bot/jobs — DB · 캐시 실패 분리', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateBotMock.mockReturnValue({ ok: true, botType: 'test-bot' })
    isBotWriteEnabledMock.mockReturnValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('경로 1 — DB 성공 + 캐시 성공 → 200, postId 반환', async () => {
    createMock.mockResolvedValue({ id: 'job-abc' })
    revalidateJobCreatedMock.mockReturnValue(undefined)

    const { POST } = await loadRoute()
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, postId: 'job-abc' })
    expect(revalidateJobCreatedMock).toHaveBeenCalledTimes(1)
  })

  it('경로 2 — DB 성공 + 캐시 실패 → 여전히 200, 동일 postId', async () => {
    createMock.mockResolvedValue({ id: 'job-abc' })
    revalidateJobCreatedMock.mockImplementation(() => {
      throw new Error('revalidateTag exploded')
    })

    const { POST } = await loadRoute()
    const res = await POST(makeReq())

    // 글이 이미 생성됐으므로 500 을 돌려주면 안 된다(봇이 재시도 → 중복 발행)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, postId: 'job-abc' })
  })

  it('경로 2 — 캐시 실패는 구조화 로그로 남긴다', async () => {
    createMock.mockResolvedValue({ id: 'job-abc' })
    revalidateJobCreatedMock.mockImplementation(() => {
      throw new Error('revalidateTag exploded')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await loadRoute()
    await POST(makeReq())

    const logged = errSpy.mock.calls.map(([a]) => String(a)).find((a) => a.includes('job_cache_revalidate_failed'))
    expect(logged, '구조화 로그가 남아야 한다').toBeDefined()
    const parsed = JSON.parse(logged!)
    expect(parsed).toMatchObject({
      event: 'job_cache_revalidate_failed',
      route: '/api/bot/jobs',
      postId: 'job-abc',
    })
    expect(parsed.message).toContain('revalidateTag exploded')
  })

  it('경로 3 — DB 생성 실패 → 500, 캐시 무효화 없음', async () => {
    createMock.mockRejectedValue(new Error('db down'))

    const { POST } = await loadRoute()
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal error' })
    expect(revalidateJobCreatedMock).not.toHaveBeenCalled()
  })

  it('필수 필드 누락 → 400, DB·캐시 모두 건드리지 않는다', async () => {
    const { POST } = await loadRoute()
    const res = await POST(makeReq({ title: '제목만' }))
    expect(res.status).toBe(400)
    expect(createMock).not.toHaveBeenCalled()
    expect(revalidateJobCreatedMock).not.toHaveBeenCalled()
  })

  it('봇 write 가 꺼져 있으면 403, DB·캐시 모두 건드리지 않는다', async () => {
    isBotWriteEnabledMock.mockReturnValue(false)
    const { POST } = await loadRoute()
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
    expect(createMock).not.toHaveBeenCalled()
    expect(revalidateJobCreatedMock).not.toHaveBeenCalled()
  })
})
