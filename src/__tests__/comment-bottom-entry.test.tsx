/**
 * PR-C1-A 하단 댓글 입력 진입점 + 표시 조건 보정.
 *
 * 고정하는 것:
 *  1. 글 초반에는 Dock이 뜨지 않는다 (광고를 덮던 원인)
 *  2. 댓글 영역이 가까워지면 뜨고, 입력창이 보이면 숨는다
 *  3. 댓글 수를 표시하지 않고, Dock 안에 입력 필드를 만들지 않는다
 *  4. 탭하면 기존 입력창으로 데려가 포커스를 준다
 *  5. 배너 지연 신호는 **입력창의 실제 노출**에만 연동된다 (Dock 노출과 별개)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  isCommentEntryActive,
  resetCommentEntryActive,
  setCommentEntryActive,
  subscribeCommentEntryActive,
} from '@/lib/comment-entry-state'
import CommentDock from '@/components/features/community/CommentDock'

const onOpen = vi.fn()
const VH = 800
const DOC_H = VH + VH * 5   // 긴 글

/** 뷰포트·문서 높이를 실제 값처럼 세운다 (happy-dom 기본값은 scrollHeight=0) */
function setViewport() {
  Object.defineProperty(window, 'innerHeight', { value: VH, configurable: true, writable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: DOC_H, configurable: true })
}
function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}

/** 댓글 입력 영역을 만든다. rect는 테스트가 직접 정한다. */
function makeTarget(top: number, height = 300) {
  const el = document.createElement('div')
  el.appendChild(document.createElement('textarea'))
  document.body.appendChild(el)
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + height, left: 0, right: 390, width: 390, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  return el
}

/** 스크롤 이벤트를 흘려 Dock 판정을 다시 돌린다 (컴포넌트가 rAF로 묶어 처리) */
async function scrollTo(y: number) {
  setScrollY(y)
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 20))
  })
}

/**
 * Dock이 뜨는 기본 조건을 만든다.
 * 실제 화면과 같은 배치다 — **섹션 시작은 화면 안, 입력창은 목록 아래(화면 밖)**.
 * 둘을 같은 위치에 두면 입력창까지 화면 안이 되어 `input_in_view`로 숨어버린다.
 */
function makePair() {
  const section = makeTarget(VH - 100)   // 섹션 시작이 화면에 들어옴 → 근접
  const input = makeTarget(VH * 3)       // 입력창은 아직 한참 아래
  return {
    section, input,
    sectionRef: { current: section } as React.RefObject<HTMLElement>,
    inputRef: { current: input } as React.RefObject<HTMLElement>,
  }
}
async function renderNearComment(isFeedback = false) {
  const { input, sectionRef, inputRef } = makePair()
  setScrollY(VH)
  const view = render(
    <CommentDock targetRef={inputRef} sectionRef={sectionRef} isFeedback={isFeedback} composing={false} onOpen={onOpen} />
  )
  await scrollTo(VH)
  return { target: input, view }
}

beforeEach(() => {
  setViewport()
  setScrollY(0)
  resetCommentEntryActive()
  // rAF를 타이머로 갈아끼워 스크롤 판정이 테스트 안에서 동기적으로 흐르게 한다
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    Number(setTimeout(() => cb(0), 0))) as unknown as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as unknown as typeof cancelAnimationFrame
})
afterEach(() => { cleanup(); resetCommentEntryActive(); document.body.innerHTML = '' })

describe('comment-entry-state — 배너 지연 신호', () => {
  it('값이 바뀔 때만 구독자에게 알린다', () => {
    const seen: boolean[] = []
    const off = subscribeCommentEntryActive((v) => seen.push(v))
    setCommentEntryActive(true)
    setCommentEntryActive(true)
    setCommentEntryActive(false)
    off()
    setCommentEntryActive(true)
    expect(seen).toEqual([true, false])
  })

  it('reset은 항상 false로 되돌린다 — 다음 글에서 배너가 막히지 않게', () => {
    setCommentEntryActive(true)
    resetCommentEntryActive()
    expect(isCommentEntryActive()).toBe(false)
  })
})

describe('CommentDock — 표시 조건', () => {
  it('글 초반에는 뜨지 않는다 (광고를 덮던 원인)', async () => {
    const { sectionRef, inputRef } = makePair()
    render(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />)
    await scrollTo(0)
    expect(screen.queryByTestId('comment-dock')).toBeNull()
  })

  it('댓글 영역이 가까워지면 뜬다', async () => {
    await renderNearComment()
    expect(screen.getByTestId('comment-dock')).toBeTruthy()
  })

  it('입력창이 화면에 보이면 숨는다 (입력창 2개 방지)', async () => {
    const { input, sectionRef, inputRef } = makePair()
    render(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />)
    await scrollTo(VH)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()

    // 입력창이 화면 안으로 들어옴
    input.getBoundingClientRect = () =>
      ({ top: 200, bottom: 500, left: 0, right: 390, width: 390, height: 300, x: 0, y: 200, toJSON: () => ({}) }) as DOMRect
    await scrollTo(VH + 200)
    expect(screen.queryByTestId('comment-dock')).toBeNull()
  })

  it('입력창을 지나치면 다시 숨는다 — 아래 광고 구간을 덮지 않는다', async () => {
    const { input, sectionRef, inputRef } = makePair()
    render(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />)
    await scrollTo(VH)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()

    input.getBoundingClientRect = () =>
      ({ top: -900, bottom: -600, left: 0, right: 390, width: 390, height: 300, x: 0, y: -900, toJSON: () => ({}) }) as DOMRect
    await scrollTo(DOC_H - VH)
    expect(screen.queryByTestId('comment-dock')).toBeNull()
  })
})

describe('CommentDock — 생김새', () => {
  it('댓글 수를 표시하지 않는다', async () => {
    await renderNearComment()
    const text = screen.getByTestId('comment-dock').textContent ?? ''
    expect(text).toContain('댓글을 남겨주세요')
    // 숫자가 한 글자도 없어야 한다 — 개수를 보여주면 "댓글이 많네"로 읽혀 진입을 막는다.
    expect(text).not.toMatch(/\d/)
  })

  it('의견수렴형이면 문구가 의견으로 바뀐다', async () => {
    await renderNearComment(true)
    expect(screen.getByTestId('comment-dock').textContent).toContain('의견을 남겨주세요')
  })

  /*
    [B안] 아래 세 가지가 이번 변경의 핵심이다.
    Dock은 이미 52px·20px이라 크기는 충분했다 — 문제는 흰 Dock 위 거의 흰 버튼이라
    "누를 수 있는 것"으로 읽히지 않는다는 점이었다.
  */
  it('오른쪽에 행동을 말하는 "쓰기"가 있다 — 아이콘만으로는 의미가 약하다', async () => {
    await renderNearComment()
    expect(screen.getByTestId('comment-dock').textContent).toContain('쓰기')
  })

  it('버튼이 배경과 대비된다 — Dock은 흰색(card), 버튼은 회색(muted)', async () => {
    await renderNearComment()
    const dockEl = screen.getByTestId('comment-dock')
    expect(dockEl.className).toContain('bg-card')
    const btn = dockEl.querySelector('button')!
    expect(btn.className).toContain('bg-muted')
    // 회귀 방지: 예전의 bg-background(#F9FAFB)는 흰 Dock과 명도차가 거의 없었다.
    expect(btn.className).not.toContain('bg-background')
  })

  it('브랜드 색을 쓰지 않는다 — 상시 노출 띠에 코랄을 얹으면 가입 배너로 읽힌다', async () => {
    await renderNearComment()
    expect(screen.getByTestId('comment-dock').outerHTML).not.toMatch(/primary|#FF6F61|#E85D50/i)
  })

  it('높이를 키우지 않는다 — 광고 겹침 0/41과 노출 타이밍이 여기에 걸려 있다', async () => {
    await renderNearComment()
    const dockEl = screen.getByTestId('comment-dock')
    // 바깥 패딩(pt-2 + safe-area)과 버튼 최소 높이가 Dock 전체 높이를 결정한다.
    expect(dockEl.className).toContain('pt-2')
    expect(dockEl.className).toContain('pb-[max(8px,env(safe-area-inset-bottom))]')
    expect(dockEl.querySelector('button')!.className).toContain('min-h-[52px]')
  })

  it('Dock 안에 입력 필드를 만들지 않는다 — 진입점이지 입력창이 아니다', async () => {
    await renderNearComment()
    const dock = screen.getByTestId('comment-dock')
    expect(dock.querySelector('textarea')).toBeNull()
    expect(dock.querySelector('input')).toBeNull()
  })

  it('모바일 전용이고, z-index를 올리지 않는다 (배너 150·FAB 97보다 아래)', async () => {
    await renderNearComment()
    const cls = screen.getByTestId('comment-dock').className
    expect(cls).toContain('md:hidden')
    expect(cls).toContain('z-[96]')
  })
})

describe('CommentDock — 동작', () => {
  it('[C1-B] 탭하면 스크롤이 아니라 하단 직접 입력을 연다', async () => {
    const { target } = await renderNearComment()
    const scrollSpy = vi.fn()
    target.scrollIntoView = scrollSpy

    fireEvent.click(screen.getByTestId('comment-dock').querySelector('button')!)
    expect(onOpen).toHaveBeenCalledTimes(1)
    // 스크롤로 데려가지 않는다 — 입력을 손가락 아래로 가져온다
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('[C1-B] 입력이 열려 있으면 Dock은 숨는다 (하단 중복 방지)', async () => {
    const { sectionRef, inputRef } = makePair()
    setScrollY(VH)
    const { rerender } = render(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />)
    await scrollTo(VH)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()

    rerender(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={true} onOpen={onOpen} />)
    expect(screen.queryByTestId('comment-dock')).toBeNull()
  })

  it('[C1-B] 입력이 열려 있는 동안 배너 지연이 유지되고, 닫으면 해제된다', async () => {
    const { sectionRef, inputRef } = makePair()   // 입력창은 화면 밖
    setScrollY(VH)
    const { rerender } = render(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />)
    await scrollTo(VH)
    expect(isCommentEntryActive()).toBe(false)

    await act(async () => { rerender(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={true} onOpen={onOpen} />) })
    expect(isCommentEntryActive()).toBe(true)

    // 닫으면 스크롤을 기다리지 않고 즉시 해제된다
    await act(async () => { rerender(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />) })
    expect(isCommentEntryActive()).toBe(false)
  })

  it('배너 지연 신호는 입력창의 실제 노출에만 연동된다 (Dock 노출과 별개)', async () => {
    const { input, sectionRef, inputRef } = makePair()
    render(<CommentDock targetRef={inputRef} sectionRef={sectionRef} composing={false} onOpen={onOpen} />)

    // Dock은 떴지만 입력창은 아직 화면 밖 → 배너를 미룰 이유가 없다
    await scrollTo(VH)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()
    expect(isCommentEntryActive()).toBe(false)

    // 입력창이 화면에 들어옴 → 배너 지연
    input.getBoundingClientRect = () =>
      ({ top: 200, bottom: 500, left: 0, right: 390, width: 390, height: 300, x: 0, y: 200, toJSON: () => ({}) }) as DOMRect
    await scrollTo(VH + 200)
    expect(isCommentEntryActive()).toBe(true)
  })
})


describe('[2026-08-11 보정] Dock이 섹션 위치를 실제로 본다 (배선 고정)', () => {
  /**
   * 이 테스트가 없으면 CommentDock이 sectionRef를 무시하도록 바뀌어도 아무도 못 잡는다.
   * 다른 테스트들은 sectionRef에 입력창과 같은 ref를 넘겨서 차이가 드러나지 않는다.
   */
  it('섹션은 가깝고 입력창은 멀 때 뜬다 — 댓글 많은 글 재현', async () => {
    const section = makeTarget(VH - 100)        // 섹션 시작이 화면 안(근접)
    const input = makeTarget(VH * 4)            // 입력창은 목록 아래 한참 멀리 (화면 밖)
    setScrollY(VH)
    render(
      <CommentDock
        targetRef={{ current: input } as React.RefObject<HTMLElement>}
        sectionRef={{ current: section } as React.RefObject<HTMLElement>}
        composing={false}
        onOpen={onOpen}
      />
    )
    await scrollTo(VH)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()
  })

  it('섹션도 입력창도 멀면 뜨지 않는다', async () => {
    const section = makeTarget(VH * 4)
    const input = makeTarget(VH * 5)
    setScrollY(VH)
    render(
      <CommentDock
        targetRef={{ current: input } as React.RefObject<HTMLElement>}
        sectionRef={{ current: section } as React.RefObject<HTMLElement>}
        composing={false}
        onOpen={onOpen}
      />
    )
    await scrollTo(VH)
    expect(screen.queryByTestId('comment-dock')).toBeNull()
  })

  it('섹션 ref가 비어 있으면 입력창 기준으로 안전하게 떨어진다', async () => {
    const input = makeTarget(VH)   // 화면 하단선에 딱 걸림 → 마진 0 기준으로 근접
    setScrollY(VH)
    render(
      <CommentDock
        targetRef={{ current: input } as React.RefObject<HTMLElement>}
        sectionRef={{ current: null } as unknown as React.RefObject<HTMLElement>}
        composing={false}
        onOpen={onOpen}
      />
    )
    await scrollTo(VH)
    expect(screen.getByTestId('comment-dock')).toBeTruthy()
  })
})
