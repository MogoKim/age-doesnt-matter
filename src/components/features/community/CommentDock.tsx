'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { setCommentEntryActive, resetCommentEntryActive } from '@/lib/comment-entry-state'
import { resolveDockVisibility } from '@/lib/comment-dock-visibility'

interface CommentDockProps {
  /** 실제 댓글 입력 영역. 탭하면 여기를 하단으로 전환한다. */
  targetRef: React.RefObject<HTMLElement | null>
  /**
   * 댓글 섹션 루트. **노출 시점은 이쪽을 기준으로 정한다.**
   * 입력창은 댓글 목록 아래에 있어서, 그것만 보면 댓글이 많은 글에서 Dock이 한참 늦게 떴다.
   */
  sectionRef: React.RefObject<HTMLElement | null>
  /** 의견수렴형(FEEDBACK) 글이면 '댓글'→'의견'. 기존 문구 정책과 맞춘다. */
  isFeedback?: boolean
  /** [PR-C1-B] 입력 영역이 하단 고정으로 전환돼 있는가. 열려 있으면 Dock은 숨는다. */
  composing: boolean
  /** [PR-C1-B] Dock 탭 — 스크롤이 아니라 하단 직접 입력을 연다. */
  onOpen: () => void
}

/**
 * 하단 댓글 입력 진입점 (PR-C1-A → 표시 조건 보정 → C1-B 직접 입력) — 모바일 전용.
 *
 * 왜 입력창을 하나 더 만들지 않았나:
 *   비회원 입력은 닉네임·번호 점진 노출과 Turnstile 위젯 생명주기를 갖는다.
 *   같은 컴포넌트를 두 벌 띄우면 위젯이 둘이 되어 토큰이 어긋나고, 제출이 15초 대기 후 조용히 실패한다.
 *   그래서 Dock은 **입력창이 아니라 진입점**이다.
 *   [C1-B] 탭하면 스크롤해서 데려가는 대신, CommentSection이 **기존 입력 영역을 그 자리에서**
 *   하단 고정으로 전환한다. 인스턴스가 그대로라 리마운트가 없고,
 *   입력 중 내용·닉네임·번호와 PR-C3 계측(focus·text_started…)이 전부 살아 있다.
 *
 * 언제 보이는가:
 *   초기 C1-A는 "입력창이 화면 밖"이면 무조건 떠서 **글 최상단부터 하단을 점유**했고,
 *   그 결과 본문 광고를 덮었다. 지금은 `resolveDockVisibility`가 정하며,
 *   광고 마크업에는 전혀 의존하지 않는다 — 기준은 **댓글을 쓸 맥락**이다.
 */
export default function CommentDock({ targetRef, sectionRef, isFeedback, composing, onOpen }: CommentDockProps) {
  const [visible, setVisible] = useState(false)

  // effect를 재등록하지 않고 최신 값을 읽기 위한 ref
  const composingRef = useRef(composing)
  composingRef.current = composing

  // 열림 상태가 바뀌는 즉시 배너 지연 신호를 갱신한다 — 다음 스크롤을 기다리지 않는다.
  //   닫힘도 반드시 여기서 처리해야 한다. 안 하면 사용자가 스크롤할 때까지 배너가 계속 미뤄진다.
  useEffect(() => {
    if (composing) {
      setCommentEntryActive(true)
      return
    }
    const node = targetRef.current
    if (!node) return
    const r = node.getBoundingClientRect()
    setCommentEntryActive(r.bottom > 0 && r.top < window.innerHeight)
  }, [composing, targetRef])

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    let frame = 0
    const evaluate = () => {
      frame = 0
      const node = targetRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      // 섹션을 못 잡으면 입력창 위치로 대체한다 — 기존(C1-B) 동작으로 안전하게 떨어진다.
      const sectionRect = sectionRef.current?.getBoundingClientRect()
      const result = resolveDockVisibility({
        inputTop: rect.top,
        inputBottom: rect.bottom,
        sectionTop: sectionRect ? sectionRect.top : rect.top,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
      })
      setVisible(result.visible)
      // 가입 배너 지연 신호.
      //  · 입력창이 실제로 화면에 있는 동안 미룬다 (C1-A)
      //  · [C1-B] 하단 직접 입력이 열려 있는 동안에는 **계속** 미룬다. 상한 없음.
      //    글을 쓰는 중에 배너가 덮으면 쓰던 내용을 잃는다. 닫거나 제출하면 아래 cleanup이 신호를 내린다.
      setCommentEntryActive(composingRef.current || result.inputInView)
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
  }, [targetRef, sectionRef])

  // [C1-B] 스크롤해서 데려가지 않는다 — 입력 영역을 손가락 아래로 가져온다.
  //   포커스는 CommentSection이 전환 렌더 직후에 준다.
  const handleTap = useCallback(() => { onOpen() }, [onOpen])

  // 입력이 열려 있으면 Dock은 숨는다 — 하단에 두 개가 겹치면 안 된다.
  if (composing || !visible) return null

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
      className="fixed bottom-0 left-0 right-0 z-[96] border-t border-border bg-card px-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_16px_rgba(15,23,42,0.13)] md:hidden"
    >
      <button
        type="button"
        onClick={handleTap}
        aria-label={label}
        /*
          [B안] 대비를 만든다 — 크기가 아니라 대비가 문제였다.
          이전에는 흰 Dock(bg-card #FFF) 위에 bg-background(#F9FAFB) 버튼이라 명도차가 거의 없었고,
          글자도 muted-foreground여서 "누를 수 있는 것"이 아니라 안내 문구 한 줄로 읽혔다.
          bg-muted(#F1F3F5) + text-muted-strong으로 배경·글자 대비를 동시에 올린다.
          ⚠️ min-h-[52px]와 바깥 패딩은 그대로다 — Dock 높이가 커지면 PR #333/#339에서 되돌린
             광고 겹침(0/41)과 노출 타이밍이 다시 흔들린다.
          ⚠️ 코랄(primary)은 쓰지 않는다. 상시 노출되는 하단 띠에 브랜드색을 얹으면 가입 배너로 읽힌다.
        */
        className="flex min-h-[52px] w-full items-center gap-3 rounded-full border border-border bg-muted px-4 text-left text-body text-muted-strong transition-[filter,background-color] active:brightness-95"
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
        {/*
          말풍선 아이콘만으로는 "여기서 쓸 수 있다"가 전달되지 않는다 — 한 단어로 행동을 못 박는다.
          흰 알약으로 두어 회색 버튼 안에서 도드라지되, 강조는 여기까지다(색 없음).
        */}
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 rounded-full border border-border bg-card px-3 py-1 text-caption font-bold text-muted-strong"
        >
          쓰기
        </span>
      </button>
    </div>
  )
}
