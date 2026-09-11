import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'

/**
 * 글상세 React #418 회귀 방지 — **하이드레이션 렌더는 서버 렌더와 같아야 한다.**
 *
 * ## 실측한 사실 (production, 2026-09-11 · main a8ff2c9b)
 * - community 글상세 40/40(100%) 에서 #418. magazine·jobs 상세 0/40. 댓글 유무·뷰포트 무관.
 * - 오류와 같은 순간(±1ms) React 가 `section.mb-12`(CommentSection) 서브트리를 통째로
 *   제거 후 재생성했다 → mismatch 난 경계가 CommentSection 이다.
 * - SSR HTML 에는 스켈레톤(`h-24 bg-muted rounded-2xl animate-pulse`)만 있고
 *   입력 UI("댓글을 남겨보세요"·"0/500"·"댓글 남기기")는 **없다**. 하이드레이션 후에는 있다.
 *
 * ## 왜 어긋나나
 * 글상세는 ISR(`revalidate=3600`)이라 `isLoggedIn` 을 넘기지 않는다
 * → `authKnown` 이 `useAppSession().status` 하나에만 의존한다.
 * 서버 렌더 시점 status 는 항상 `'loading'`(스켈레톤).
 * 그런데 CommentSection 은 `<Suspense>` 안이라 **늦게 하이드레이트**되고,
 * 그 사이 `AppSessionProvider` 는 세션 힌트가 없는 비회원에 대해
 * 네트워크 없이 즉시 `setStatus('unauthenticated')` 로 확정한다.
 * → 하이드레이션 렌더 시 `authKnown=true` → 입력 UI. 서버(스켈레톤)와 **구조가 다르다.**
 *
 * ## 이 테스트가 고정하는 것
 * 서버 HTML 로 하이드레이트할 때 **복구 가능 오류(mismatch)가 0건**이어야 한다.
 * 텍스트가 아니라 구조 mismatch 이므로 suppressHydrationWarning 으로 덮지 않는다.
 */

const mock = vi.hoisted(() => ({ status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated' }))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: (fn: unknown) => fn, useOptimistic: <T,>(state: T) => [state, () => {}] as const }
})
vi.mock('next/navigation', () => ({
  usePathname: () => '/community/stories/post-abc',
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/components/common/AppSessionProvider', () => ({
  useAppSession: () => ({ status: mock.status, user: null }),
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
vi.mock('@/components/features/community/CommentItem', () => ({ default: () => null }))

import CommentSection from '@/components/features/community/CommentSection'

const SKELETON = 'animate-pulse'

/**
 * 서버 렌더 → 그 HTML 로 하이드레이트.
 * `duringHydration` 은 **경계가 하이드레이트되는 시점의 세션 상태**다
 * (Suspense 경계가 늦게 하이드레이트되는 동안 provider 가 이미 확정한 값).
 */
function ssrThenHydrate(duringHydration: typeof mock.status, props: Record<string, unknown> = {}) {
  mock.status = 'loading' // 서버에는 세션이 없다 — 항상 loading
  const serverHtml = renderToString(<CommentSection postId="post-abc" comments={[]} {...props} />)

  const container = document.createElement('div')
  container.innerHTML = serverHtml
  document.body.appendChild(container)
  const hydrationHtml = container.innerHTML

  mock.status = duringHydration
  const recoverable: string[] = []
  let root: ReturnType<typeof hydrateRoot> | null = null
  act(() => {
    root = hydrateRoot(container, <CommentSection postId="post-abc" comments={[]} {...props} />, {
      onRecoverableError: (e) => recoverable.push(String((e as Error)?.message ?? e)),
    })
  })
  return { serverHtml, hydrationHtml, container, recoverable, root }
}

beforeEach(() => { mock.status = 'loading' })
afterEach(() => { cleanup(); document.body.innerHTML = '' })

describe('[H418] CommentSection 하이드레이션 — 서버와 클라이언트 첫 렌더가 같아야 한다', () => {
  it('서버 렌더는 스켈레톤이다 (입력 UI 없음) — production SSR 실측과 일치', () => {
    mock.status = 'loading'
    const html = renderToString(<CommentSection postId="post-abc" comments={[]} />)
    expect(html).toContain(SKELETON)
    expect(html.toLowerCase()).not.toContain('maxlength="500"')
  })

  it('🔴 경계가 늦게 하이드레이트되어 세션이 이미 확정돼도 mismatch 가 없어야 한다', () => {
    // 비회원(세션 힌트 없음) → provider 가 네트워크 없이 즉시 unauthenticated 로 확정한 상황
    const { recoverable } = ssrThenHydrate('unauthenticated')
    expect(recoverable, `하이드레이션 복구 오류: ${recoverable.join(' | ')}`).toEqual([])
  })

  it('🔴 로그인 세션이 먼저 확정된 경우에도 mismatch 가 없어야 한다', () => {
    const { recoverable } = ssrThenHydrate('authenticated')
    expect(recoverable, `하이드레이션 복구 오류: ${recoverable.join(' | ')}`).toEqual([])
  })

  it('세션이 아직 loading 이면 당연히 mismatch 가 없다 (대조군)', () => {
    const { recoverable } = ssrThenHydrate('loading')
    expect(recoverable).toEqual([])
  })

  it('isLoggedIn 을 명시로 넘기는 호출부는 서버·클라이언트가 모두 입력 UI 다 — 지연 없음(회귀 방지)', () => {
    mock.status = 'loading'
    const html = renderToString(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    expect(html).not.toContain(SKELETON)
    expect(html.toLowerCase()).toContain('maxlength="500"')
    const { recoverable } = ssrThenHydrate('unauthenticated', { isLoggedIn: false })
    expect(recoverable).toEqual([])
  })

  it('하이드레이션 이후에는 입력 UI 가 실제로 나타난다 (기능 무회귀)', async () => {
    const { container } = ssrThenHydrate('unauthenticated')
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('textarea[maxlength="500"]')).not.toBeNull()
    expect(container.innerHTML).not.toContain(SKELETON)
  })
})
