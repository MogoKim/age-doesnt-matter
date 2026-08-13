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
/*
  placeholder로 찾지 않는다 — 하단 패널이 열리면 문구가 '생각을 자유롭게 적어주세요'로 바뀐다(B안).
  이 파일이 검증하려는 건 "인스턴스가 하나뿐"이라는 사실이므로, 열림/닫힘과 무관한 특징으로 잡는다.
  (CommentItem이 mock이라 답글 입력이 없어 본문 textarea는 항상 하나다)
*/
const contentBox = () => {
  const el = document.querySelector('textarea[maxlength="500"]')
  if (!el) throw new Error('본문 textarea를 찾지 못했다')
  return el as HTMLTextAreaElement
}

/**
 * Dock이 뜨는 상태를 만든다.
 * 실제 화면과 같은 배치여야 한다 — **댓글 섹션은 화면 안, 입력 영역은 목록 아래(화면 밖)**.
 * 둘을 같은 위치에 두면 입력창까지 화면 안이 되어 `input_in_view`로 Dock이 숨는다.
 * (Dock 노출 기준이 섹션 시작 + 마진 0이므로 섹션이 실제로 화면에 들어와야 뜬다)
 */
function setupVisibleDock() {
  Object.defineProperty(window, 'innerHeight', { value: VH, configurable: true, writable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: VH * 6, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: VH, configurable: true, writable: true })
  const rect = (top: number, height = 300) =>
    ({ top, bottom: top + height, left: 0, right: 390, width: 390, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  Element.prototype.getBoundingClientRect = function () {
    // 댓글 섹션 루트: 화면 안 → 근접 성립
    if ((this as Element).tagName === 'SECTION') return rect(VH - 100)
    // 그 외(입력 영역 등): 목록 아래 멀리 → input_in_view 아님
    return rect(VH * 3)
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

/**
 * [C2-B] 등록 버튼 가시성.
 *
 * 프로덕션 실측(390x844): 패널 내용 579px vs 표시 463px → 넘침 116px로 등록 버튼이
 * 활성화된 순간에 화면 밖(패널 하단 +38px)에 있었다. 390x667에서는 넘침 213px.
 * 그래서 패널이 열린 동안만 버튼 줄을 패널 스크롤포트 하단에 고정한다.
 *
 * 여기서 반드시 고정해야 하는 것은 **인라인에 새지 않는다**는 쪽이다:
 * 인라인에는 스크롤 조상이 없어 sticky가 뷰포트 기준으로 붙고, 그러면 Dock(z-96)과
 * 하단을 다투며 PR #333/#339에서 되돌린 광고 겹침이 재발한다.
 */
describe('[C2-B] 등록 버튼 하단 고정 — 패널에서만', () => {
  const submitRow = () => screen.getByRole('button', { name: '댓글 남기기' }).parentElement!

  it('패널이 열리면 등록 버튼 줄이 패널 하단에 고정된다', async () => {
    await renderAndOpen()
    const cls = submitRow().className
    expect(cls).toContain('max-md:sticky')
    expect(cls).toContain('max-md:bottom-0')
    expect(cls).toContain('max-md:bg-card')   // 뒤 입력칸이 비쳐 보이지 않게
  })

  it('인라인 상태에는 sticky가 새지 않는다 (광고 겹침 재발 방지)', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    expect(submitRow().className).not.toContain('sticky')
  })

  it('패널을 닫으면 sticky가 풀린다', async () => {
    await renderAndOpen()
    expect(submitRow().className).toContain('max-md:sticky')
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await flushScroll()
    expect(submitRow().className).not.toContain('sticky')
  })

  it('Turnstile 위젯은 여전히 1개다 — 버튼 줄 클래스 변경이 리마운트를 만들지 않는다', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })
    expect(mock.turnstileRender.mock.calls.length).toBe(1)

    fireEvent.click(dock()!.querySelector('button')!)   // sticky 켜짐
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })

    expect(mock.turnstileRender.mock.calls.length).toBe(1)
    expect(mock.turnstileRemove).not.toHaveBeenCalled()
    expect(document.querySelectorAll('textarea')).toHaveLength(1)
  })

  it('회원 입력에는 이 고정을 넣지 않는다 (비회원 전용)', async () => {
    mock.loggedIn = true
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn />)
    await flushScroll()
    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    // 패널 컨테이너 자체가 max-md:bottom-0을 갖고 있으므로 문서 전체로 보면 안 된다.
    // 회원 '등록' 버튼 줄만 본다 — 회원 입력은 자체 sticky(bottom-[72px])를 이미 갖는 별개 구조다.
    const memberRow = screen.getByRole('button', { name: '등록' }).parentElement!
    expect(memberRow.className).not.toContain('max-md:bottom-0')
    expect(memberRow.className).not.toContain('max-md:sticky')
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


describe('[닫기 확인 · H2] 쓰던 내용이 있을 때만 묻는다', () => {
  const sheet = () => screen.queryByTestId('comment-close-confirm')

  it('빈 입력에서 ✕를 누르면 확인 없이 바로 닫힌다', async () => {
    await renderAndOpen()
    expect(contentBox().value).toBe('')

    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    expect(sheet()).toBeNull()
    expect(openedPanel()).toBeNull()   // 패널도 닫혔다
  })

  it('내용이 있을 때 ✕를 누르면 확인 시트가 뜨고, 패널은 아직 닫히지 않는다', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '우리 나이엔 정말 그렇더라고요' } })

    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    expect(sheet()).toBeTruthy()
    expect(openedPanel()).toBeTruthy()
    expect(sheet()!.textContent).toContain('댓글 작성을 멈출까요?')
    expect(sheet()!.textContent).toContain('쓰던 내용은 그대로 있어요')
  })

  it('공백만 있으면 내용으로 치지 않는다 — 바로 닫힌다', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '   ' } })

    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    expect(sheet()).toBeNull()
    expect(openedPanel()).toBeNull()
  })

  it('"계속 쓰기"를 고르면 시트만 닫히고 입력 내용이 그대로 남는다', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '쓰던 내용' } })
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    fireEvent.click(screen.getByTestId('comment-close-confirm-keep'))
    await act(async () => { await new Promise((r) => setTimeout(r, 120)) })

    expect(sheet()).toBeNull()
    expect(openedPanel()).toBeTruthy()      // 패널은 열린 채로
    expect(contentBox().value).toBe('쓰던 내용')
  })

  it('"닫기"를 고르면 패널이 닫히고, 다시 열어도 내용이 살아 있다', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '쓰던 내용' } })
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    fireEvent.click(screen.getByTestId('comment-close-confirm-close'))
    await flushScroll()

    expect(sheet()).toBeNull()
    expect(openedPanel()).toBeNull()
    // 인스턴스가 그대로라 내용이 남는다 (C1-B 전제)
    expect(contentBox().value).toBe('쓰던 내용')
  })

  it('불안 문구를 쓰지 않는다 — 실제로 내용이 보존되기 때문', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    const text = sheet()!.textContent ?? ''
    for (const banned of ['사라', '없어', '삭제', '되돌릴', '저장되지']) {
      expect(text).not.toContain(banned)
    }
  })

  it('확인 중에도 입력 인스턴스는 그대로다 — Turnstile 위젯이 둘이 되면 안 된다', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })
    expect(mock.turnstileRender.mock.calls.length).toBe(1)

    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })
    fireEvent.click(screen.getByTestId('comment-close-confirm-keep'))
    await act(async () => { await new Promise((r) => setTimeout(r, 350)) })

    expect(mock.turnstileRender.mock.calls.length).toBe(1)
    expect(document.querySelectorAll('textarea')).toHaveLength(1)
  })

  /**
   * ⚠️ happy-dom은 `focus()`가 커서를 글 끝으로 보내지 않는다(실브라우저와 다르다).
   *   그래서 "커서가 튀었는지"를 값으로 확인할 수 없다.
   *   대신 **복원 호출이 저장된 위치로 실제 일어나는지**를 감시한다.
   *   실화면 확인은 브라우저 QA에서 따로 한다.
   */
  it('"계속 쓰기" 후 포커스와 커서 위치를 되돌린다', async () => {
    await renderAndOpen()
    const ta = contentBox()
    fireEvent.change(ta, { target: { value: '우리 나이엔 정말 그렇더라고요' } })
    ta.setSelectionRange(5, 5)          // 문장 중간에 커서를 둔다

    const focusSpy = vi.spyOn(ta, 'focus')
    const caretSpy = vi.spyOn(ta, 'setSelectionRange')

    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    focusSpy.mockClear(); caretSpy.mockClear()

    fireEvent.click(screen.getByTestId('comment-close-confirm-keep'))
    await act(async () => { await new Promise((r) => setTimeout(r, 150)) })

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(caretSpy).toHaveBeenCalledWith(5, 5)   // 글 끝(14)이 아니라 원래 자리로
  })

  it('가입 배너(150)·팝업(200)보다 아래 층만 쓴다', async () => {
    await renderAndOpen()
    fireEvent.change(contentBox(), { target: { value: '내용' } })
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    expect(sheet()!.className).toContain('z-[98]')
    expect(document.querySelector('.z-\\[97\\]')).toBeTruthy()   // dim
  })
})

/*
  [B안] 열린 패널의 문구.
  이전에는 제목 '댓글을 남겨보세요'와 placeholder '댓글을 남겨주세요...'가 같은 말을 두 번 해서
  모드가 바뀐 느낌이 없었다. 제목은 **지금 무엇을 하는 중인지**, placeholder는 **무엇을 쓸지**만 맡는다.
*/
describe('[B안] 작성 패널 제목과 placeholder', () => {
  const heading = () => screen.queryByTestId('comment-compose-heading')

  it('열면 제목이 "댓글 쓰는 중"이다', async () => {
    await renderAndOpen()
    expect(heading()?.textContent).toBe('댓글 쓰는 중')
  })

  it('닫혀 있을 때는 패널 제목이 없다 — 인라인 상태의 화면을 바꾸지 않는다', async () => {
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn={false} />)
    await flushScroll()
    expect(heading()).toBeNull()
  })

  it('제목과 placeholder가 같은 말을 반복하지 않는다', async () => {
    await renderAndOpen()
    const ph = contentBox().placeholder
    expect(ph).toBe('생각을 자유롭게 적어주세요')
    expect(ph).not.toContain('댓글')
    expect(heading()!.textContent).not.toContain(ph)
  })

  it('닫으면 원래 placeholder로 돌아온다 — 인라인 문구는 그대로다', async () => {
    await renderAndOpen()
    fireEvent.click(screen.getByTestId('comment-compose-close'))
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    expect(contentBox().placeholder).toBe('댓글을 남겨주세요... (최대 500자)')
  })

  it('열린 동안 비회원 입력의 자체 제목은 접힌다 — 제목이 둘이 되지 않는다', async () => {
    await renderAndOpen()
    const own = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === '댓글을 남겨보세요')
    expect(own).toBeTruthy()                          // 데스크탑용으로 DOM에는 남는다
    expect(own!.className).toContain('max-md:hidden') // 모바일에서만 접는다
  })

  it('회원도 같은 제목을 본다 — 경로별로 다르게 보이지 않는다', async () => {
    mock.loggedIn = true
    render(<CommentSection postId="post-abc" comments={[]} isLoggedIn />)
    await flushScroll()
    fireEvent.click(dock()!.querySelector('button')!)
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    expect(heading()?.textContent).toBe('댓글 쓰는 중')
  })
})
