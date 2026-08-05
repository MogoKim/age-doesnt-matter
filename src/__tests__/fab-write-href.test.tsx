import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'

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

describe('비로그인 — 여기서 막지 않는다', () => {
  /**
   * 회귀 이력: 비회원이 폼까지 들어올 수 있게 열어놓고도(#273) FAB이 여전히 로그인 모달을
   * 띄우고 있어서, 실제 사용자는 글쓰기 화면 근처에도 못 갔다. 입구를 막으면 뒤를 아무리
   * 열어놔도 소용이 없다 — 로그인 요청은 다 쓰고 [등록]을 눌렀을 때 폼이 한다.
   */
  it('버튼이 아니라 링크다 — 누르면 그냥 이동한다', () => {
    mockStatus = 'unauthenticated'
    mockPathname = '/'
    render(<FAB />)
    const el = screen.getByLabelText('글쓰기')
    expect(el.tagName).toBe('A')
    expect(el.getAttribute('href')).toBe('/community/write/select')
  })

  it('눌러도 로그인 모달이 뜨지 않는다', () => {
    mockStatus = 'unauthenticated'
    mockPathname = '/'
    render(<FAB />)
    fireEvent.click(screen.getByLabelText('글쓰기'))
    expect(screen.queryByTestId('login-modal')).toBeNull()
  })

  it('게시판에서도 그 게시판 글쓰기로 바로 간다', () => {
    mockStatus = 'unauthenticated'
    for (const [path, href] of BOARD_CASES) {
      mockPathname = path
      render(<FAB />)
      const el = screen.getByLabelText('글쓰기')
      expect(el.tagName, path).toBe('A')
      expect(el.getAttribute('href'), path).toBe(href)
      cleanup()
    }
  })

  it('로그인 여부와 상관없이 목적지가 같다', () => {
    for (const path of ['/', ...BOARD_CASES.map(([p]) => p)]) {
      mockPathname = path
      mockStatus = 'authenticated'
      render(<FAB />)
      const asMember = screen.getByLabelText('글쓰기').getAttribute('href')
      cleanup()
      mockStatus = 'unauthenticated'
      render(<FAB />)
      const asGuest = screen.getByLabelText('글쓰기').getAttribute('href')
      cleanup()
      expect(asGuest, path).toBe(asMember)
    }
  })
})

describe('FAB은 세션을 보지 않는다 — 소스 고정', () => {
  it('로그인 모달·세션 훅을 import하지 않는다', () => {
    const src = readFileSync(join(__dirname, '../components/layouts/FAB.tsx'), 'utf-8')
    expect(src).not.toMatch(/LoginPromptModal/)
    expect(src).not.toMatch(/useAppSession/)
  })
})
