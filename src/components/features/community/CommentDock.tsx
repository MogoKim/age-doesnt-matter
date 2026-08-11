'use client'

import { useCallback, useEffect, useState } from 'react'
import { setCommentEntryActive, resetCommentEntryActive } from '@/lib/comment-entry-state'
import { resolveDockVisibility } from '@/lib/comment-dock-visibility'

interface CommentDockProps {
  /** 실제 댓글 입력 영역. Dock은 이 위치를 기준으로 보일지 정하고, 탭하면 여기로 데려간다. */
  targetRef: React.RefObject<HTMLElement | null>
  /** 의견수렴형(FEEDBACK) 글이면 '댓글'→'의견'. 기존 문구 정책과 맞춘다. */
  isFeedback?: boolean
}

/**
 * 하단 댓글 입력 진입점 (PR-C1-A + 표시 조건 보정) — 모바일 전용.
 *
 * 왜 입력창을 하나 더 만들지 않았나:
 *   비회원 입력은 닉네임·번호 점진 노출과 Turnstile 위젯 생명주기를 갖는다.
 *   같은 컴포넌트를 두 벌 띄우면 위젯이 둘이 되어 토큰 발급이 어긋난다.
 *   그래서 Dock은 **입력창이 아니라 진입점**이다 — 누르면 기존 입력창으로 데려가 포커스만 준다.
 *   덕분에 비회원·회원 작성 흐름과 PR-C3 계측(focus·text_started…)이 그대로 살아 있다.
 *
 * 언제 보이는가:
 *   초기 C1-A는 "입력창이 화면 밖"이면 무조건 떠서 **글 최상단부터 하단을 점유**했고,
 *   그 결과 본문 광고를 덮었다. 지금은 `resolveDockVisibility`가 정하며,
 *   광고 마크업에는 전혀 의존하지 않는다 — 기준은 **댓글을 쓸 맥락**이다.
 */
export default function CommentDock({ targetRef, isFeedback }: CommentDockProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    let frame = 0
    const evaluate = () => {
      frame = 0
      const node = targetRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const result = resolveDockVisibility({
        inputTop: rect.top,
        inputBottom: rect.bottom,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
      })
      setVisible(result.visible)
      // 가입 배너 지연 신호 — 입력창이 **실제로 화면에 있는 동안**에만 미룬다.
      // Dock 노출 여부와는 별개다(Dock이 안 보여도 입력창이 보이면 배너는 미뤄야 한다).
      setCommentEntryActive(result.inputInView)
    }

    // 스크롤마다 레이아웃을 재는 대신 프레임당 1회로 묶는다.
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(evaluate)
    }

    evaluate()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      // 글을 떠날 때 신호를 반드시 내린다. 안 내리면 다음 글에서 배너가 영영 안 뜬다.
      resetCommentEntryActive()
    }
  }, [targetRef])

  const handleTap = useCallback(() => {
    const el = targetRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // 스크롤이 끝난 뒤 포커스해야 화면이 튀지 않는다. preventScroll로 이중 스크롤도 막는다.
    window.setTimeout(() => {
      const field = el.querySelector<HTMLTextAreaElement>('textarea')
      field?.focus({ preventScroll: true })
    }, 320)
  }, [targetRef])

  if (!visible) return null

  const label = isFeedback ? '의견을 남겨주세요' : '댓글을 남겨주세요'

  return (
    <div
      data-testid="comment-dock"
      /*
        z-[96]: 글쓰기 FAB(97)·가입 배너(150)보다 아래에 둔다.
        글 상세에서는 FAB이 애초에 렌더되지 않으므로(resolveWriteHref → null) 하단 버튼은 항상 하나뿐이고,
        배너가 뜨는 순간에는 배너가 위를 덮는 게 맞다 — 대신 배너 자동 노출 자체를
        댓글 입력 맥락에서 미루므로(comment-entry-state) 입력이 막히지 않는다.
        ⚠️ 광고를 덮는 문제를 z-index로 풀지 않는다. 문제는 레이어가 아니라 **점유 시간**이었다.
      */
      className="fixed bottom-0 left-0 right-0 z-[96] border-t border-border bg-card px-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] md:hidden"
    >
      <button
        type="button"
        onClick={handleTap}
        aria-label={label}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-full border border-border bg-background px-4 text-left text-body text-muted-foreground transition-colors active:bg-muted"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="truncate">{label}</span>
      </button>
    </div>
  )
}
