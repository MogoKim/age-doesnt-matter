'use client'

import { useCallback, useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/track'
import {
  COMMENT_FUNNEL_EVENTS,
  commentFunnelProperties,
  type CommentFunnelContext,
  type CommentFunnelEvent,
  type CommentFunnelExtra,
} from '@/lib/comment-funnel'

/**
 * 댓글 작성 퍼널 계측 훅 (PR-C3).
 *
 * 화면을 바꾸지 않는다 — 이벤트만 붙인다.
 * 반환하는 `viewRef`를 입력 영역 컨테이너에 달면 그 영역이 실제로 보였을 때
 * `comment_input_view`가 **한 번만** 발화한다.
 *
 * 중복 방지: focus·첫 타이핑·신원단계 진입은 컴포넌트 인스턴스당 1회로 제한한다.
 *   포커스를 들락날락하거나 글자를 지웠다 다시 써도 재발화하지 않는다 —
 *   퍼널 분모가 사람 수가 아니라 조작 횟수가 되면 이탈률을 읽을 수 없기 때문이다.
 *   반대로 제출 시도·실패는 **매번** 보낸다. 재시도 횟수 자체가 신호다.
 */
export function useCommentFunnel(ctx: CommentFunnelContext) {
  // 최신 ctx를 콜백 정체성 변화 없이 읽기 위한 ref — 리렌더마다 핸들러가 새로 만들어지지 않게 한다.
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  const firedRef = useRef<Set<string>>(new Set())
  const viewRef = useRef<HTMLDivElement>(null)

  /** 매번 보낸다 (제출 시도·실패용) */
  const track = useCallback((event: CommentFunnelEvent, extra?: CommentFunnelExtra) => {
    trackEvent(event, commentFunnelProperties(ctxRef.current, extra))
  }, [])

  /** 인스턴스당 1회만 보낸다 */
  const trackOnce = useCallback(
    (event: CommentFunnelEvent, extra?: CommentFunnelExtra) => {
      if (firedRef.current.has(event)) return
      firedRef.current.add(event)
      trackEvent(event, commentFunnelProperties(ctxRef.current, extra))
    },
    []
  )

  // 입력 영역이 실제로 보였을 때만 view — 렌더됐다고 본 것은 아니다.
  useEffect(() => {
    const el = viewRef.current
    if (!el) return

    // IO 미지원 환경은 즉시 발화 (graceful degradation — LazyAd와 동일 정책)
    if (typeof IntersectionObserver === 'undefined') {
      trackOnce(COMMENT_FUNNEL_EVENTS.inputView)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackOnce(COMMENT_FUNNEL_EVENTS.inputView)
          io.disconnect()
        }
      },
      { threshold: 0.01 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [trackOnce])

  return {
    /** 입력 영역 컨테이너에 단다 → comment_input_view */
    viewRef,
    /** 입력창 포커스 (1회) */
    onInputFocus: useCallback(() => trackOnce(COMMENT_FUNNEL_EVENTS.inputFocus), [trackOnce]),
    /** 첫 글자 입력 (1회) */
    onTextStarted: useCallback(() => trackOnce(COMMENT_FUNNEL_EVENTS.textStarted), [trackOnce]),
    /** 비회원 신원(닉네임·번호) 단계 진입 (1회) */
    onIdentityStarted: useCallback(
      () => trackOnce(COMMENT_FUNNEL_EVENTS.identityStarted),
      [trackOnce]
    ),
    /** 등록 버튼 누름 (매번 — 재시도 횟수가 신호) */
    onSubmitAttempted: useCallback(() => track(COMMENT_FUNNEL_EVENTS.submitAttempted), [track]),
    /** 등록 실패 (매번, 사유 코드만) */
    onSubmitFailed: useCallback(
      (errorCode: NonNullable<CommentFunnelExtra['errorCode']>) =>
        track(COMMENT_FUNNEL_EVENTS.submitFailed, { errorCode }),
      [track]
    ),
    /** 등록 후 가입 유도 카드 노출 (1회) */
    onSignupPromptShown: useCallback(
      () => trackOnce(COMMENT_FUNNEL_EVENTS.signupPromptShown),
      [trackOnce]
    ),
  }
}
