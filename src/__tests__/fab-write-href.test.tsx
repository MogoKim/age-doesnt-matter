import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

/**
 * 글쓰기 FAB이 "어디서 보이는지"와 "어디로 보내는지".
 *
 * 홈에는 게시판이 정해져 있지 않아 선택 화면으로 보내야 하는데, 예전 FAB은 목적지를
 * pathname.includes로 골라서 어느 것에도 안 걸리면 humor로 떨어졌다.
 * 홈에 FAB을 붙이는 순간 홈에서 쓴 글이 전부 웃음방으로 갔을 상황이라, 그 분기를 고정한다.
 */

let mockPathname = '/'
let mockStatus: 'authenticated' | 'unauthenticated' = 'authenticated'

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }))
vi.mock('@/components/common/AppSessionProvider', () => ({
  useAppSession: () => ({ status: mockStatus }),
}))
vi.mock('@/components/features/auth/LoginPromptModal', () => ({
  default: ({ message, callbackUrl }: { message: string; callbackUrl?: string }) => (
    <div data-testid="login-modal" data-callback={callbackUrl}>{message}</div>
  ),
}))

const { default: FAB } = await import('@/components/layouts/FAB')

beforeEach(() => {
  mockPathname = '/'
  mockStatus = 'authenticated'
})
afterEach(cleanup)

const BOARD_CASES: [string, string][] = [
  ['/community/menopause', '/community/write?board=menopause'],
  ['/community/stories', '/community/write?board=stories'],
  ['/community/life2', '/community/write?board=life2'],
  ['/community/humor', '/community/write?board=humor'],
]

describe('노출 대상', () => {
  it('홈과 글쓰기 가능한 게시판 4곳에서 보인다', () => {
    for (const path of ['/', ...BOARD_CASES.map(([p]) => p)]) {
      mockPathname = path
      render(<FAB />)
      expect(screen.queryByLabelText('글쓰기'), path).not.toBeNull()
      cleanup()
    }
  })

  it('그 밖의 경로에서는 안 보인다', () => {
    for (const path of [
      '/best', '/magazine', '/jobs', '/search',
      '/community/stories/abc123',   // 글 상세
      '/community/write',            // 글쓰기 폼
      '/community/write/select',     // 선택 화면 자신
      '/my', '/about',
    ]) {
      mockPathname = path
      render(<FAB />)
      expect(screen.queryByLabelText('글쓰기'), path).toBeNull()
      cleanup()
    }
  })
})

describe('로그인 상태 — 목적지', () => {
  it('홈에서는 게시판 선택 화면으로 간다', () => {
    mockPathname = '/'
    render(<FAB />)
    expect(screen.getByLabelText('글쓰기').getAttribute('href')).toBe('/community/write/select')
  })

  it('게시판에서는 그 게시판으로 바로 간다 — 선택 화면을 건너뛴다', () => {
    for (const [path, href] of BOARD_CASES) {
      mockPathname = path
      render(<FAB />)
      expect(screen.getByLabelText('글쓰기').getAttribute('href'), path).toBe(href)
      cleanup()
    }
  })

  it('홈이 humor로 떨어지지 않는다 — 예전 폴백의 회귀 방지', () => {
    mockPathname = '/'
    render(<FAB />)
    expect(screen.getByLabelText('글쓰기').getAttribute('href')).not.toContain('humor')
  })
})

describe('비로그인 — 로그인 유도', () => {
  it('누르면 이동하지 않고 로그인 모달이 뜬다', () => {
    mockStatus = 'unauthenticated'
    mockPathname = '/'
    render(<FAB />)
    const btn = screen.getByLabelText('글쓰기')
    expect(btn.tagName).toBe('BUTTON')      // Link가 아니라 버튼 = 이동 없음
    expect(screen.queryByTestId('login-modal')).toBeNull()
    fireEvent.click(btn)
    expect(screen.getByTestId('login-modal')).toBeTruthy()
  })

  it('홈에서 뜬 모달은 로그인 후 선택 화면으로 데려간다', () => {
    mockStatus = 'unauthenticated'
    mockPathname = '/'
    render(<FAB />)
    fireEvent.click(screen.getByLabelText('글쓰기'))
    expect(screen.getByTestId('login-modal').getAttribute('data-callback'))
      .toBe('/community/write/select')
  })

  it('게시판에서 뜬 모달은 로그인 후 그 게시판 글쓰기로 데려간다', () => {
    mockStatus = 'unauthenticated'
    for (const [path, href] of BOARD_CASES) {
      mockPathname = path
      render(<FAB />)
      fireEvent.click(screen.getByLabelText('글쓰기'))
      expect(screen.getByTestId('login-modal').getAttribute('data-callback'), path).toBe(href)
      cleanup()
    }
  })
})
