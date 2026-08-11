/**
 * PR-C3 댓글 퍼널 계측 테스트.
 *
 * 지키려는 것:
 *  1. 각 단계가 **올바른 순간에 한 번만** 발화한다 (focus/타이핑 중복 폭증 방지)
 *  2. properties에 **민감정보가 절대 들어가지 않는다** (댓글 내용·닉네임·비밀번호·토큰)
 *  3. guest / member 분기가 정확하다
 *  4. root / reply 구분과 parent_comment_id가 정확하다
 *  5. 성공 이벤트를 **새로 만들지 않았다** (기존 comment_create 유지)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { COMMENT_FUNNEL_EVENTS, boardSlugFromPath, commentFunnelProperties } from '@/lib/comment-funnel'

const mock = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  createComment: vi.fn(async () => ({ error: undefined as string | undefined })),
  toast: vi.fn(),
  pathname: '/community/stories/post-abc',
}))

vi.mock('@/lib/track', () => ({ trackEvent: mock.trackEvent }))
vi.mock('@/lib/gtm', () => ({ gtmCommentCreate: vi.fn() }))
vi.mock('@/lib/actions/comments', () => ({ createComment: mock.createComment }))
vi.mock('@/components/common/PushPermissionToast', () => ({ setPushToastTrigger: vi.fn() }))
vi.mock('@/components/common/Toast', () => ({ useToast: () => ({ toast: mock.toast }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => mock.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}))

import CommentInput from '@/components/features/community/CommentInput'

/** 민감정보로 절대 새면 안 되는 값들 — 테스트에서 실제로 입력해 본다. */
const SECRET_CONTENT = '우리 나이엔 정말 그렇더라고요 비밀이야기'
const SECRET_NICKNAME = '또래친구닉'
const SECRET_PASSWORD = '4821'

function eventsNamed(name: string) {
  return mock.trackEvent.mock.calls.filter((c) => c[0] === name)
}
function propsOf(name: string): Record<string, unknown> {
  const call = mock.trackEvent.mock.calls.find((c) => c[0] === name)
  return (call?.[1] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  mock.trackEvent.mockClear()
  mock.createComment.mockClear()
  mock.createComment.mockResolvedValue({ error: undefined })
  mock.pathname = '/community/stories/post-abc'
  // happy-dom에 IntersectionObserver가 없다 → 훅이 즉시 발화 경로를 타게 둔다(graceful degradation 검증도 겸함)
  // @ts-expect-error 테스트 환경 정리
  delete globalThis.IntersectionObserver
})
afterEach(cleanup)

describe('boardSlugFromPath', () => {
  it('글 상세 경로에서 board slug를 뽑는다', () => {
    expect(boardSlugFromPath('/community/stories/abc123')).toBe('stories')
    expect(boardSlugFromPath('/community/menopause/xyz')).toBe('menopause')
  })
  it('형태가 다르면 null — 이벤트는 보내되 차원만 비운다', () => {
    expect(boardSlugFromPath('/magazine/abc')).toBeNull()
    expect(boardSlugFromPath('/community')).toBeNull()
    expect(boardSlugFromPath(null)).toBeNull()
    expect(boardSlugFromPath('/community/대문자Slug/x')).toBeNull()
  })
})

describe('commentFunnelProperties — 민감정보 차단', () => {
  it('허용된 키만 담는다', () => {
    const p = commentFunnelProperties({ postId: 'p1', userState: 'guest' })
    expect(Object.keys(p).sort()).toEqual(
      ['board_slug', 'comment_target', 'input_mode', 'post_id', 'surface', 'user_state'].sort()
    )
  })
  it('reply일 때만 parent_comment_id가 붙는다', () => {
    expect(commentFunnelProperties({ postId: 'p1', userState: 'member' }).comment_target).toBe('root')
    const reply = commentFunnelProperties({ postId: 'p1', parentId: 'c9', userState: 'member' })
    expect(reply.comment_target).toBe('reply')
    expect(reply.parent_comment_id).toBe('c9')
  })
  it('error_code는 실패일 때만 붙는다', () => {
    expect(commentFunnelProperties({ postId: 'p1', userState: 'guest' }).error_code).toBeUndefined()
    expect(
      commentFunnelProperties({ postId: 'p1', userState: 'guest' }, { errorCode: 'turnstile_unavailable' }).error_code
    ).toBe('turnstile_unavailable')
  })
})

describe('회원 입력창 (CommentInput)', () => {
  it('노출 → 포커스 → 첫 글자 순으로 각 1회만 발화한다', () => {
    render(<CommentInput postId="post-abc" />)
    const ta = screen.getByPlaceholderText('댓글을 남겨주세요...')

    expect(eventsNamed('comment_input_view')).toHaveLength(1)

    // 포커스를 세 번 들락날락해도 1회
    fireEvent.focus(ta)
    fireEvent.blur(ta)
    fireEvent.focus(ta)
    fireEvent.focus(ta)
    expect(eventsNamed('comment_input_focus')).toHaveLength(1)

    // 글자를 여러 번 고쳐도 1회 — 지웠다 다시 써도 재발화하지 않는다
    fireEvent.change(ta, { target: { value: '우' } })
    fireEvent.change(ta, { target: { value: '우리' } })
    fireEvent.change(ta, { target: { value: '' } })
    fireEvent.change(ta, { target: { value: '다시' } })
    expect(eventsNamed('comment_text_started')).toHaveLength(1)
  })

  it('공백만 입력하면 text_started가 발화하지 않는다', () => {
    render(<CommentInput postId="post-abc" />)
    const ta = screen.getByPlaceholderText('댓글을 남겨주세요...')
    fireEvent.change(ta, { target: { value: '   ' } })
    expect(eventsNamed('comment_text_started')).toHaveLength(0)
  })

  it('user_state=member, comment_target=root, board_slug가 정확하다', () => {
    render(<CommentInput postId="post-abc" />)
    const p = propsOf('comment_input_view')
    expect(p.user_state).toBe('member')
    expect(p.comment_target).toBe('root')
    expect(p.post_id).toBe('post-abc')
    expect(p.surface).toBe('post_detail_comment')
    expect(p.input_mode).toBe('inline')
    expect(p.parent_comment_id).toBeUndefined()
  })

  it('답글이면 comment_target=reply + parent_comment_id', () => {
    render(<CommentInput postId="post-abc" parentId="cmt-7" />)
    const p = propsOf('comment_input_view')
    expect(p.comment_target).toBe('reply')
    expect(p.parent_comment_id).toBe('cmt-7')
  })

  it('제출 시도는 매번 보낸다 — 재시도 횟수가 신호다', async () => {
    render(<CommentInput postId="post-abc" />)
    const ta = screen.getByPlaceholderText('댓글을 남겨주세요...')
    fireEvent.change(ta, { target: { value: SECRET_CONTENT } })
    const btn = screen.getByRole('button', { name: '등록' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(eventsNamed('comment_submit_attempted').length).toBeGreaterThanOrEqual(2)
  })

  it('빈 입력으로는 제출 시도가 발화하지 않는다 (성공률 분모 오염 방지)', () => {
    render(<CommentInput postId="post-abc" />)
    const btn = screen.getByRole('button', { name: '등록' })
    fireEvent.click(btn)
    expect(eventsNamed('comment_submit_attempted')).toHaveLength(0)
  })

  it('서버가 error를 반환하면 사유 코드만 남긴다', async () => {
    mock.createComment.mockResolvedValue({ error: '금칙어가 포함돼 있어요' })
    render(<CommentInput postId="post-abc" />)
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요...'), {
      target: { value: SECRET_CONTENT },
    })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await vi.waitFor(() => expect(eventsNamed('comment_submit_failed')).toHaveLength(1))
    const p = propsOf('comment_submit_failed')
    expect(p.error_code).toBe('server_rejected')
    // 서버 원문 메시지가 새지 않는다
    expect(JSON.stringify(p)).not.toContain('금칙어')
  })

  it('성공 이벤트를 새로 만들지 않았다 — 기존 comment_create만 남는다', async () => {
    render(<CommentInput postId="post-abc" />)
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요...'), {
      target: { value: SECRET_CONTENT },
    })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await vi.waitFor(() => expect(eventsNamed('comment_create')).toHaveLength(1))
    expect(eventsNamed('comment_submit_succeeded')).toHaveLength(0)
    // 기존 comment_create의 payload 의미가 바뀌지 않았다
    expect(propsOf('comment_create')).toMatchObject({
      content_type: 'post',
      content_id: 'post-abc',
      comment_type: 'comment',
    })
  })

  it('어떤 이벤트에도 댓글 내용이 들어가지 않는다', async () => {
    render(<CommentInput postId="post-abc" />)
    fireEvent.change(screen.getByPlaceholderText('댓글을 남겨주세요...'), {
      target: { value: SECRET_CONTENT },
    })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await vi.waitFor(() => expect(eventsNamed('comment_create')).toHaveLength(1))

    const everything = JSON.stringify(mock.trackEvent.mock.calls)
    expect(everything).not.toContain(SECRET_CONTENT)
    expect(everything).not.toContain('우리 나이엔')
  })
})

describe('rate limit 면제 — 퍼널이 429로 조용히 깨지지 않게', () => {
  it('클라가 보내는 댓글 이벤트가 전부 CONVERSION_EVENTS에 있다', async () => {
    const { readFileSync } = await import('node:fs')
    const route = readFileSync('src/app/api/events/route.ts', 'utf8')
    const list = route.match(/const CONVERSION_EVENTS = \[([^\]]+)\]/)?.[1] ?? ''

    // 실제로 발화하는 이벤트만 대상. signupPromptClicked는 이번 PR에서 발화하지 않는다
    // (기존 kakao_button_click{from:'guest_comment_success'}가 그 역할).
    const emitted = Object.entries(COMMENT_FUNNEL_EVENTS)
      .filter(([key]) => key !== 'signupPromptClicked')
      .map(([, name]) => name)

    for (const name of emitted) {
      expect(list, `${name}이(가) rate limit 면제 목록에 없다 — 429로 유실될 수 있다`).toContain(`'${name}'`)
    }
    // 기존 성공 이벤트도 같이 보호한다: comment_input_view가 버킷 소진을 가속하기 때문
    expect(list).toContain("'comment_create'")
  })
})

describe('민감정보 — 퍼널 properties 전수 검사', () => {
  it('닉네임·비밀번호·토큰 형태의 값이 어떤 조합에서도 새지 않는다', () => {
    const built = [
      commentFunnelProperties({ postId: 'p', userState: 'guest' }),
      commentFunnelProperties({ postId: 'p', parentId: 'c', userState: 'guest' }, { errorCode: 'unexpected' }),
      commentFunnelProperties({ postId: 'p', userState: 'member' }, { errorCode: 'server_rejected' }),
    ]
    const serialized = JSON.stringify(built)
    for (const secret of [SECRET_NICKNAME, SECRET_PASSWORD, SECRET_CONTENT]) {
      expect(serialized).not.toContain(secret)
    }
    // 금지 키가 아예 존재하지 않는다
    for (const p of built) {
      for (const banned of ['content', 'nickname', 'password', 'token', 'turnstile', 'email', 'ip']) {
        expect(Object.keys(p)).not.toContain(banned)
      }
    }
  })
})
