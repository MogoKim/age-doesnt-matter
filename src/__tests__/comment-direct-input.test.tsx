/**
 * PR-C1-B 하단 직접 입력.
 *
 * 이 PR의 전제는 하나다: **입력 인스턴스를 새로 만들지 않는다.**
 * 그래서 여기서 반드시 고정해야 하는 것도 두 가지다.
 *  1. 열고 닫아도 입력 중이던 내용·닉네임·번호가 살아 있다 (리마운트가 없다는 증거)
 *  2. Turnstile 위젯이 끝까지 1개다 (2개면 토큰이 어긋나 제출이 15초 뒤 조용히 실패한다)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const VH = 800
const mock = vi.hoisted(() => ({
  turnstileRender: vi.fn(() => 'widget-1'),
  turnstileRemove: vi.fn(),
  loggedIn: false,
}))

/**
 * node_modules의 React는 18.3.1이라 `useOptimistic`이 없다.
 * 앱 런타임은 Next.js가 자체 번들 React를 쓰므로 프로덕션은 정상이고, 이 차이는 **테스트 환경 한정**이다.
 * CommentSection이 optimistic 목록 갱신에 쓰지만 이 파일이 보는 것은 입력 영역이므로
 * 상태를 그대로 돌려주는 최소 shim으로 충분하다.
 */
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: (fn: unknown) => fn,
    useOptimistic: <T,>(state: T) => [state, () => {}] as const,
  }
})

vi.mock('next/navigation', () => ({
  usePathname: () => '/community/stories/post-abc',
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/components/common/AppSessionProvider', () => ({
  useAppSession: () => ({ status: mock.loggedIn ? 'authenticated' : 'unauthenticated', user: null }),
}))
vi.mock('@/components/common/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/gtm', () => ({ gtmCommentCreate: vi.fn() }))
vi.mock('@/lib/actions/comments', () => ({ createComment: vi.fn(async () => ({ error: undefined })) }))
vi.mock('@/lib/actions/guest-comments', () => ({ createGuestComment: vi.fn(async () => ({ error: undefined })) }))
vi.mock('@/components/common/PushPermissionToast', () => ({ setPushToastTrigger: vi.fn() }))
vi.mock('@/components/features/auth/KakaoSignupButton', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}))
// 댓글 목록은 이 PR의 관심사가 아니다 — 하위 의존성을 끊는다
vi.mock('@/components/features/community/CommentItem', () => ({ default: () => null }))

import CommentSection from '@/components/features/community/CommentSection'

const OPEN_CLASS = 'max-md:fixed'
const dock = () => screen.queryByTestId('comment-dock')
const openedPanel = () => document.querySelector(`.${CSS.escape(OPEN_CLASS)}`)
const contentBox = () => screen.getByPlaceholderText('댓글을 남겨주세요... (최대 500자)') as HTMLTextAreaElement

/** Dock이 뜨는 상태를 만든다: 입력 영역이 화면 아래 근접 + 화면 절반 스크롤 */
function setupVisibleDock() {
  Object.defineProperty(window, 'innerHeight', { value: VH, configurable: true, writable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: VH * 6, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: VH, configurable: true, writable: true })
  Element.prototype.getBoundingClientRect = function () {
    return { top: VH + 100, bottom: VH + 400, left: 0, right: 390, width: 390, height: 300, x: 0, y: VH + 100, toJSON: () => ({}) } as DOMRect
  }
}
async function flushScroll() {
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 30))
  })
}
async function renderAndOpen() {
  render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={mock.loggedIn} />)
  await flushScroll()
  fireEvent.click(dock()!.querySelector('button')!)
  await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
}

const originalRect = Element.prototype.getBoundingClientRect

beforeEach(() => {
  mock.loggedIn = false
  mock.turnstileRender.mockClear()
  mock.turnstileRemove.mockClear()
  vi.stubEnv('NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY', 'test-key')
  window.turnstile = { render: mock.turnstileRender, remove: mock.turnstileRemove, reset: vi.fn() }
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => Number(setTimeout(() => cb(0), 0))) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as unknown as typeof cancelAnimationFrame
  setupVisibleDock()
  // CommentSection은 마운트 시 투표 배지를 조회한다 — 네트워크를 끊는다(이 PR의 관심사가 아니다)
  globalThis.fetch = vi.fn(async () => new Response('{"badges":null,"comments":[]}', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  delete window.turnstile
  Element.prototype.getBoundingClientRect = originalRect
})

describe('Dock 탭 → 하단 직접 입력 전환', () => {
  it('탭하면 입력 영역이 하단 고정으로 바뀌고 닫기 버튼이 생긴다', async () => {
    await renderAndOpen()
    expect(openedPanel()).toBeTruthy()
    expect(screen.getByTestId('comment-compose-close')).toBeTruthy()
  })

  it('열리면 Dock은 숨는다 — 하단에 두 개가 겹치지 않는다', async () => {
    await renderAndOpen()
    expect(dock()).toBeNull()
  })

  it('닫으면 하단 고정이 풀리고 Dock이 돌아온다 (C1-A 상태)', async () => {
    await renderAndOpen()
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await flushScroll()
    expect(openedPanel()).toBeNull()
    expect(dock()).toBeTruthy()
  })

  it('전면 시트가 아니다 — 높이 상한과 내부 스크롤을 갖는다', async () => {
    await renderAndOpen()
    const cls = openedPanel()!.className
    expect(cls).toContain('max-md:max-h-[55dvh]')
    expect(cls).toContain('max-md:overflow-y-auto')
  })
})

describe('입력 인스턴스가 하나뿐임을 증명', () => {
  it('열고 닫아도 입력 중이던 내용이 보존된다 (리마운트 없음)', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    fireEvent.change(contentBox(), { target: { value: '우리 나이엔 정말 그렇더라고요' } })

    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    expect(contentBox().value).toBe('우리 나이엔 정말 그렇더라고요')

    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await flushScroll()
    expect(contentBox().value).toBe('우리 나이엔 정말 그렇더라고요')
  })

  it('닉네임·번호도 보존된다', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    fireEvent.change(screen.getByPlaceholderText('예: 또래친구'), { target: { value: '또래친구' } })
    fireEvent.change(screen.getByPlaceholderText('숫자 4자리'), { target: { value: '4821' } })

    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    expect((screen.getByPlaceholderText('예: 또래친구') as HTMLInputElement).value).toBe('또래친구')
    expect((screen.getByPlaceholderText('숫자 4자리') as HTMLInputElement).value).toBe('4821')
  })

  it('textarea가 화면에 하나뿐이다 — 입력창을 새로 만들지 않았다', async () => {
    await renderAndOpen()
    expect(document.querySelectorAll('textarea')).toHaveLength(1)
  })

  it('Turnstile 위젯이 끝까지 1개다 (열고 닫아도 재생성 없음)', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    // 내용을 넣어야 위젯이 렌더된다
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })
    const afterType = mock.turnstileRender.mock.calls.length
    expect(afterType).toBe(1)

    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })

    expect(mock.turnstileRender.mock.calls.length).toBe(1)
    expect(mock.turnstileRemove).not.toHaveBeenCalled()
  })
})

describe('비회원 점진 노출 — 타이밍 무변경', () => {
  it('내용을 쓰기 전에는 이름·번호 칸이 없다 (열린 상태에서도)', async () => {
    await renderAndOpen()
    expect(screen.queryByPlaceholderText('예: 또래친구')).toBeNull()
    expect(screen.queryByPlaceholderText('숫자 4자리')).toBeNull()
  })

  it('내용을 쓰면 이름·번호 칸이 나타난다', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    expect(screen.getByPlaceholderText('예: 또래친구')).toBeTruthy()
    expect(screen.getByPlaceholderText('숫자 4자리')).toBeTruthy()
  })
})

describe('회원 경로', () => {
  it('회원도 하단 직접 입력으로 전환되고, 입력창은 하나뿐이다', async () => {
    mock.loggedIn = true
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={true} />)
    await flushScroll()
    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })

    expect(openedPanel()).toBeTruthy()
    expect(document.querySelectorAll('textarea')).toHaveLength(1)
    // 회원에게는 닉네임·번호·봇검증이 없다
    expect(screen.queryByPlaceholderText('예: 또래친구')).toBeNull()
    expect(mock.turnstileRender).not.toHaveBeenCalled()
  })
})
