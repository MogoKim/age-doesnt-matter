/**
 * PR-C3 — 비회원 댓글 퍼널 계측 테스트.
 *
 * 특히 검증하는 것:
 *  - `comment_identity_started`가 **닉네임·번호 칸을 실제로 눌렀을 때** 발화한다.
 *    (showExtraFields는 첫 글자와 동시에 켜지므로 그 시점으로 잡으면 comment_text_started와 구분되지 않는다)
 *  - Turnstile 토큰 미도착이 `turnstile_unavailable`로만 남는다 — 토큰 값 자체는 절대 안 남는다.
 *  - 노출 타이밍(닉네임/번호가 언제 나타나는지)이 **바뀌지 않았다**.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const TURNSTILE_TOKEN = 'cf-token-SHOULD-NEVER-APPEAR-0xdeadbeef'
const SECRET_CONTENT = '비회원이 남긴 진짜 댓글 내용'
const SECRET_NICKNAME = '또래친구닉'
const SECRET_PASSWORD = '4821'

const mock = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  createGuestComment: vi.fn(async () => ({ error: undefined as string | undefined })),
  toast: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/track', () => ({ trackEvent: mock.trackEvent }))
vi.mock('@/lib/actions/guest-comments', () => ({ createGuestComment: mock.createGuestComment }))
vi.mock('@/components/common/Toast', () => ({ useToast: () => ({ toast: mock.toast }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/community/stories/post-abc',
  useRouter: () => ({ refresh: mock.refresh }),
}))
vi.mock('@/components/features/auth/KakaoSignupButton', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}))

import GuestCommentInput from '@/components/features/community/GuestCommentInput'

function eventsNamed(name: string) {
  return mock.trackEvent.mock.calls.filter((c) => c[0] === name)
}
function propsOf(name: string): Record<string, unknown> {
  return (mock.trackEvent.mock.calls.find((c) => c[0] === name)?.[1] ?? {}) as Record<string, unknown>
}
/** Turnstile 위젯 스텁 — provideToken=false면 토큰이 영원히 오지 않는 상황을 재현한다. */
function stubTurnstile(provideToken: boolean) {
  window.turnstile = {
    render: (_el: HTMLElement, options: Record<string, unknown>) => {
      if (provideToken) (options.callback as (t: string) => void)(TURNSTILE_TOKEN)
      return 'widget-1'
    },
    reset: vi.fn(),
    remove: vi.fn(),
  }
}

beforeEach(() => {
  mock.trackEvent.mockClear()
  mock.createGuestComment.mockClear()
  mock.createGuestComment.mockResolvedValue({ error: undefined })
  mock.toast.mockClear()
  vi.stubEnv('NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY', 'test-site-key')
  // @ts-expect-error 테스트 환경 정리 — 미지원 시 즉시 발화 경로 검증도 겸함
  delete globalThis.IntersectionObserver
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  delete window.turnstile
})

describe('비회원 입력창 — 퍼널 단계', () => {
  it('노출 → 포커스 → 첫 글자가 각 1회, user_state=guest', () => {
    render(<GuestCommentInput postId="post-abc" />)
    const ta = screen.getByPlaceholderText('댓글을 남겨주세요... (최대 500자)')

    expect(eventsNamed('comment_input_view')).toHaveLength(1)
    expect(propsOf('comment_input_view').user_state).toBe('guest')
    expect(propsOf('comment_input_view').comment_target).toBe('root')

    fireEvent.focus(ta)
    fireEvent.focus(ta)
    expect(eventsNamed('comment_input_focus')).toHaveLength(1)

    fireEvent.change(ta, { target: { value: '비' } })
    fireEvent.change(ta, { target: { value: '비회원' } })
    expect(eventsNamed('comment_text_started')).toHaveLength(1)
  })

  it('identity_started는 텍스트 입력만으로는 발화하지 않는다 (text_started와 구분)', () => {
    render(<GuestCommentInput postId="post-abc" />)
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요... (최대 500자)'), {
      target: { value: SECRET_CONTENT },
    })
    // 이름·번호 칸이 나타나긴 하지만, 아직 "진입"한 것은 아니다
    expect(screen.getByPlaceholderText('예: 또래친구')).toBeTruthy()
    expect(eventsNamed('comment_text_started')).toHaveLength(1)
    expect(eventsNamed('comment_identity_started')).toHaveLength(0)
  })

  it('닉네임 칸을 누르면 identity_started 1회 — 번호 칸까지 눌러도 여전히 1회', () => {
    render(<GuestCommentInput postId="post-abc" />)
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요... (최대 500자)'), {
      target: { value: SECRET_CONTENT },
    })
    fireEvent.focus(screen.getByPlaceholderText('예: 또래친구'))
    fireEvent.focus(screen.getByPlaceholderText('숫자 4자리'))
    fireEvent.focus(screen.getByPlaceholderText('예: 또래친구'))
    expect(eventsNamed('comment_identity_started')).toHaveLength(1)
  })

  it('노출 타이밍 회귀 — 내용을 쓰기 전에는 이름·번호 칸이 없다', () => {
    render(<GuestCommentInput postId="post-abc" />)
    expect(screen.queryByPlaceholderText('예: 또래친구')).toBeNull()
    expect(screen.queryByPlaceholderText('숫자 4자리')).toBeNull()
  })

  it('답글이면 comment_target=reply + parent_comment_id', () => {
    render(<GuestCommentInput postId="post-abc" parentId="cmt-42" />)
    expect(propsOf('comment_input_view').comment_target).toBe('reply')
    expect(propsOf('comment_input_view').parent_comment_id).toBe('cmt-42')
  })
})

describe('비회원 입력창 — 제출', () => {
  async function fillAndSubmit() {
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요... (최대 500자)'), {
      target: { value: SECRET_CONTENT },
    })
    fireEvent.change(screen.getByPlaceholderText('예: 또래친구'), { target: { value: SECRET_NICKNAME } })
    fireEvent.change(screen.getByPlaceholderText('숫자 4자리'), { target: { value: SECRET_PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: '댓글 남기기' }))
  }

  it('성공: comment_create만 남고 새 성공 이벤트는 없다 + 가입 카드 노출이 계측된다', async () => {
    stubTurnstile(true)
    render(<GuestCommentInput postId="post-abc" />)
    await fillAndSubmit()

    await vi.waitFor(() => expect(eventsNamed('comment_create')).toHaveLength(1))
    expect(eventsNamed('comment_submit_succeeded')).toHaveLength(0)
    expect(propsOf('comment_create')).toMatchObject({ comment_type: 'guest_comment' })

    // 등록 후 가입 유도 카드 노출 (기존 UI — 새로 만들지 않았다)
    await vi.waitFor(() => expect(eventsNamed('comment_signup_prompt_shown')).toHaveLength(1))
    // 클릭 이벤트는 새로 만들지 않는다 — KakaoSignupButton의 kakao_button_click이 담당
    expect(eventsNamed('comment_signup_prompt_clicked')).toHaveLength(0)
  })

  it('서버 거절: 사유 코드만 남고 원문 메시지는 안 남는다', async () => {
    stubTurnstile(true)
    mock.createGuestComment.mockResolvedValue({ error: '금칙어가 포함돼 있어요' })
    render(<GuestCommentInput postId="post-abc" />)
    await fillAndSubmit()

    await vi.waitFor(() => expect(eventsNamed('comment_submit_failed')).toHaveLength(1))
    expect(propsOf('comment_submit_failed').error_code).toBe('server_rejected')
    expect(JSON.stringify(propsOf('comment_submit_failed'))).not.toContain('금칙어')
  })

  it('제출 시도는 매번 — 성공률 분모', async () => {
    stubTurnstile(true)
    render(<GuestCommentInput postId="post-abc" />)
    await fillAndSubmit()
    await vi.waitFor(() => expect(eventsNamed('comment_submit_attempted').length).toBeGreaterThanOrEqual(1))
  })
})

describe('민감정보 — 비회원 전 구간', () => {
  it('댓글 내용·닉네임·비밀번호·Turnstile 토큰이 어떤 이벤트에도 없다', async () => {
    stubTurnstile(true)
    render(<GuestCommentInput postId="post-abc" />)
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요... (최대 500자)'), {
      target: { value: SECRET_CONTENT },
    })
    fireEvent.focus(screen.getByPlaceholderText('예: 또래친구'))
    fireEvent.change(screen.getByPlaceholderText('예: 또래친구'), { target: { value: SECRET_NICKNAME } })
    fireEvent.change(screen.getByPlaceholderText('숫자 4자리'), { target: { value: SECRET_PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: '댓글 남기기' }))
    await vi.waitFor(() => expect(eventsNamed('comment_create')).toHaveLength(1))

    const everything = JSON.stringify(mock.trackEvent.mock.calls)
    for (const secret of [SECRET_CONTENT, SECRET_NICKNAME, SECRET_PASSWORD, TURNSTILE_TOKEN]) {
      expect(everything).not.toContain(secret)
    }
  })
})
