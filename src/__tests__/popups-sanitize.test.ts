import { describe, it, expect, vi, beforeEach } from 'vitest'

// prisma만 mock — sanitizeHtml(@/lib/sanitize)은 실제 구현을 통과시켜 서버 정화를 검증한다.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    popup: { findMany: vi.fn() },
  },
}))

import { getActivePopups } from '@/lib/queries/popups'
import { prisma } from '@/lib/prisma'

const mockFindMany = vi.mocked(prisma.popup.findMany)

/** prisma.popup.findMany 가 반환하는 raw row 형태(getActivePopups가 select하는 필드) */
function rawPopup(content: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    type: 'CENTER',
    target: 'ALL',
    targetPaths: [],
    title: '테스트 팝업',
    content,
    imageUrl: null,
    linkUrl: null,
    buttonText: null,
    showOncePerDay: false,
    hideForDays: null,
    priority: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getActivePopups — 서버 측 HTML 정화(/api/popups 응답)', () => {
  it('raw content를 응답에 노출하지 않고 sanitizedContentHtml만 제공', async () => {
    mockFindMany.mockResolvedValue([rawPopup('<p>안녕하세요</p>')] as never)
    const [popup] = await getActivePopups('/')
    expect(popup).toHaveProperty('sanitizedContentHtml')
    expect(popup).not.toHaveProperty('content')
    expect(popup.sanitizedContentHtml).toContain('<p>')
    expect(popup.sanitizedContentHtml).toContain('안녕하세요')
  })

  it('<script> 태그 제거 (XSS 방어)', async () => {
    mockFindMany.mockResolvedValue([
      rawPopup('<p>정상</p><script>alert("xss")</script>'),
    ] as never)
    const [popup] = await getActivePopups('/')
    expect(popup.sanitizedContentHtml).not.toContain('<script>')
    expect(popup.sanitizedContentHtml).not.toContain('alert')
    expect(popup.sanitizedContentHtml).toContain('정상')
  })

  it('img onerror 핸들러 제거', async () => {
    mockFindMany.mockResolvedValue([
      rawPopup('<img src="https://example.com/a.jpg" alt="x" onerror="alert(1)">'),
    ] as never)
    const [popup] = await getActivePopups('/')
    expect(popup.sanitizedContentHtml).not.toContain('onerror')
    expect(popup.sanitizedContentHtml).toContain('<img')
  })

  it('javascript: URL 제거', async () => {
    mockFindMany.mockResolvedValue([
      rawPopup('<a href="javascript:alert(1)">클릭</a>'),
    ] as never)
    const [popup] = await getActivePopups('/')
    expect(popup.sanitizedContentHtml).not.toContain('javascript:')
    expect(popup.sanitizedContentHtml).toContain('클릭')
  })

  it('content가 null이면 sanitizedContentHtml도 null', async () => {
    mockFindMany.mockResolvedValue([rawPopup(null)] as never)
    const [popup] = await getActivePopups('/')
    expect(popup.sanitizedContentHtml).toBeNull()
  })
})
