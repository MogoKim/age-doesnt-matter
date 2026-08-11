/**
 * PR-C1 하단 댓글 입력 진입점.
 *
 * 고정하는 것:
 *  1. Dock은 입력창이 화면 밖일 때만 뜨고, 댓글 수를 표시하지 않는다
 *  2. 탭하면 기존 입력창으로 데려가 포커스를 준다 (입력창을 새로 만들지 않는다)
 *  3. 댓글 입력이 화면에 있는 동안 가입 배너 자동 노출이 **미뤄진다** (취소가 아니다)
 *  4. 입력창이 화면을 벗어나면 배너가 **다시 뜬다**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  isCommentEntryActive,
  setCommentEntryActive,
  resetCommentEntryActive,
  subscribeCommentEntryActive,
} from '@/lib/comment-entry-state'
import CommentDock from '@/components/features/community/CommentDock'

/** IntersectionObserver 스텁 — 콜백을 테스트가 직접 호출해 교차 상태를 만든다. */
let ioCallbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = []
class StubIO {
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { ioCallbacks.push(cb) }
  observe() {}
  disconnect() {}
}
function setInputInView(visible: boolean) {
  act(() => { ioCallbacks.forEach((cb) => cb([{ isIntersecting: visible }])) })
}

beforeEach(() => {
  ioCallbacks = []
  resetCommentEntryActive()
  // @ts-expect-error 테스트 스텁
  globalThis.IntersectionObserver = StubIO
})
afterEach(() => { cleanup(); resetCommentEntryActive() })

describe('comment-entry-state — 배너 지연 신호', () => {
  it('값이 바뀔 때만 구독자에게 알린다', () => {
    const seen: boolean[] = []
    const off = subscribeCommentEntryActive((v) => seen.push(v))
    setCommentEntryActive(true)
    setCommentEntryActive(true)   // 중복 — 알리지 않는다
    setCommentEntryActive(false)
    off()
    setCommentEntryActive(true)   // 해제 후 — 알리지 않는다
    expect(seen).toEqual([true, false])
  })

  it('reset은 항상 false로 되돌린다 — 다음 글에서 배너가 막히지 않게', () => {
    setCommentEntryActive(true)
    expect(isCommentEntryActive()).toBe(true)
    resetCommentEntryActive()
    expect(isCommentEntryActive()).toBe(false)
  })
})

describe('CommentDock', () => {
  function renderDock(isFeedback = false) {
    const Harness = () => {
      const ref = { current: document.createElement('div') } as React.RefObject<HTMLElement>
      const ta = document.createElement('textarea')
      ref.current!.appendChild(ta)
      document.body.appendChild(ref.current!)
      return <CommentDock targetRef={ref} isFeedback={isFeedback} />
    }
    return render(<Harness />)
  }

  it('입력창이 화면에 있으면 Dock이 뜨지 않는다 (입력창 2개 방지)', () => {
    renderDock()
    setInputInView(true)
    expect(screen.queryByTestId('comment-dock')).toBeNull()
  })

  it('입력창이 화면 밖이면 Dock이 뜬다', () => {
    renderDock()
    setInputInView(false)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()
  })

  it('Dock에 댓글 수를 표시하지 않는다', () => {
    renderDock()
    setInputInView(false)
    const text = screen.getByTestId('comment-dock').textContent ?? ''
    expect(text).toBe('댓글을 남겨주세요')
    expect(text).not.toMatch(/\d/)
  })

  it('의견수렴형이면 문구가 의견으로 바뀐다', () => {
    renderDock(true)
    setInputInView(false)
    expect(screen.getByTestId('comment-dock').textContent).toBe('의견을 남겨주세요')
  })

  it('Dock 안에 입력 필드를 만들지 않는다 — 진입점이지 입력창이 아니다', () => {
    renderDock()
    setInputInView(false)
    const dock = screen.getByTestId('comment-dock')
    expect(dock.querySelector('textarea')).toBeNull()
    expect(dock.querySelector('input')).toBeNull()
  })

  it('모바일 전용 — 데스크탑에서는 숨는다', () => {
    renderDock()
    setInputInView(false)
    expect(screen.getByTestId('comment-dock').className).toContain('md:hidden')
  })

  it('가입 배너(z-150)·FAB(z-97)보다 아래에 둔다', () => {
    renderDock()
    setInputInView(false)
    expect(screen.getByTestId('comment-dock').className).toContain('z-[96]')
  })

  it('입력창이 화면에 들어오면 배너 지연 신호를 켠다', () => {
    renderDock()
    setInputInView(true)
    expect(isCommentEntryActive()).toBe(true)
    setInputInView(false)
    expect(isCommentEntryActive()).toBe(false)
  })

  it('탭하면 기존 입력창으로 스크롤하고 포커스를 준다', () => {
    vi.useFakeTimers()
    const target = document.createElement('div')
    const ta = document.createElement('textarea')
    target.appendChild(ta)
    document.body.appendChild(target)
    const scrollSpy = vi.fn()
    target.scrollIntoView = scrollSpy
    const focusSpy = vi.spyOn(ta, 'focus')

    const ref = { current: target } as React.RefObject<HTMLElement>
    render(<CommentDock targetRef={ref} />)
    setInputInView(false)
    fireEvent.click(screen.getByTestId('comment-dock').querySelector('button')!)

    expect(scrollSpy).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(400) })
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    vi.useRealTimers()
  })
})
