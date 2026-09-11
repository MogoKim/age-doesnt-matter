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

const mock = vi.hoisted(() => ({
  status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated',
  /** 이 테스트가 허용한 내부 API 만 기록된다. 그 밖의 요청은 즉시 실패시킨다 */
  fetchCalls: [] as string[],
  /** 외부 스크립트 삽입 시도 (Turnstile 등) */
  scriptSrcs: [] as string[],
}))

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

/**
 * 입력 컴포넌트는 **격리한다.**
 *
 * 이 파일이 고정하려는 것은 CommentSection 의 `authKnown` 게이트가
 * 서버 렌더와 하이드레이션 렌더에서 **같은 구조**를 내는가이다.
 * 실제 `GuestCommentInput` 은 마운트 시 Cloudflare Turnstile 스크립트를 `<head>` 에 붙여
 * happy-dom 에서 DOMException 을 던지고(외부 스크립트 로드), 그 잡음은 이 계약과 무관하다.
 *
 * 그래서 **textarea 하나만 가진 최소 컴포넌트**로 바꾼다 —
 * 스켈레톤(입력 없음)과 입력 영역(입력 있음)의 구조 차이는 그대로 보존된다.
 */
function InputStub({ placeholder }: { placeholder?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mt-4">
      <p className="text-body font-bold text-foreground mb-3">댓글을 남겨보세요</p>
      <textarea rows={3} maxLength={500} placeholder={placeholder ?? '댓글을 남겨주세요... (최대 500자)'} />
      <p className="text-caption text-muted-foreground text-right mb-3">0/500</p>
      <button type="button">댓글 남기기</button>
    </div>
  )
}
vi.mock('@/components/features/community/CommentInput', () => ({ default: InputStub }))
vi.mock('@/components/features/community/GuestCommentInput', () => ({ default: InputStub }))

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
  let root!: ReturnType<typeof hydrateRoot>
  act(() => {
    root = hydrateRoot(container, <CommentSection postId="post-abc" comments={[]} {...props} />, {
      onRecoverableError: (e) => recoverable.push(String((e as Error)?.message ?? e)),
    })
  })
  // 테스트 종료 시 반드시 정리한다 — 남겨두면 다음 테스트에서 effect·fetch 가 계속 돈다
  roots.push(root)
  return { serverHtml, hydrationHtml, container, recoverable, root }
}

/** 이 테스트가 아는 내부 API 만 응답한다. 그 밖은 실패시켜 '조용히 새는 요청'을 못 만들게 한다. */
const ALLOWED = [/^\/api\/votes\/badges\?/, /^\/api\/comments\?/]

const roots: ReturnType<typeof hydrateRoot>[] = []
let appendChildSpy: ReturnType<typeof vi.spyOn> | null = null

beforeEach(() => {
  mock.status = 'loading'
  mock.fetchCalls = []
  mock.scriptSrcs = []

  // 네트워크 차단 — CommentSection 의 배지·개인화 댓글 fetch 를 테스트 안에서 끝낸다.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String((input as Request).url)
    mock.fetchCalls.push(url)
    if (!ALLOWED.some((re) => re.test(url))) {
      throw new Error(`허용되지 않은 네트워크 요청: ${url}`)
    }
    const body = url.startsWith('/api/votes/badges') ? { badges: null } : { comments: [] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }))

  // 외부 스크립트 삽입 감시 — Turnstile 같은 게 붙으면 즉시 드러나게 한다.
  const realAppend = Node.prototype.appendChild
  appendChildSpy = vi.spyOn(Node.prototype, 'appendChild').mockImplementation(function (this: Node, node: Node) {
    const el = node as Partial<HTMLScriptElement> & { tagName?: string }
    if (el?.tagName === 'SCRIPT' && el.src) {
      mock.scriptSrcs.push(String(el.src))
      return node // 실제로 붙이지 않는다 — happy-dom 의 외부 로드 DOMException 차단
    }
    return realAppend.call(this, node) as Node
  })
})

afterEach(() => {
  // hydrateRoot 로 만든 root 를 반드시 내린다
  for (const r of roots.splice(0)) act(() => { r.unmount() })
  cleanup()
  appendChildSpy?.mockRestore()
  appendChildSpy = null
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

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

  it('외부 스크립트 삽입 0건 · 허용 밖 네트워크 요청 0건 (테스트 격리 보장)', async () => {
    const { container } = ssrThenHydrate('unauthenticated')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    // Turnstile 등 외부 스크립트가 붙으면 여기서 드러난다
    expect(mock.scriptSrcs, `외부 스크립트 삽입: ${mock.scriptSrcs.join(', ')}`).toEqual([])
    expect(container.querySelector('script[src]')).toBeNull()

    // 실제 네트워크로 나가는 요청은 없다 — 전부 테스트 안에서 응답한다
    for (const url of mock.fetchCalls) {
      expect(url.startsWith('/api/'), `상대경로 내부 API 가 아니다: ${url}`).toBe(true)
      expect(/^https?:\/\//.test(url), `외부 절대 URL 요청: ${url}`).toBe(false)
    }
    // 호출되더라도 이 둘 뿐이다 (비회원이라 /api/comments 는 안 나갈 수 있다)
    const unexpected = mock.fetchCalls.filter((u) => !/^\/api\/(votes\/badges|comments)\?/.test(u))
    expect(unexpected, `예상 밖 요청: ${unexpected.join(', ')}`).toEqual([])
  })

  it('하이드레이션 이후에는 입력 UI 가 실제로 나타난다 (기능 무회귀)', async () => {
    const { container } = ssrThenHydrate('unauthenticated')
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('textarea[maxlength="500"]')).not.toBeNull()
    expect(container.innerHTML).not.toContain(SKELETON)
  })
})
