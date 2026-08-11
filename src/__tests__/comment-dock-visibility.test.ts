/**
 * CommentDock 표시 조건 — 임계값 고정.
 *
 * C1-A는 "입력창이 화면 밖"이면 무조건 떠서 글 최상단부터 하단을 점유했고,
 * 그 결과 본문 광고를 덮었다(41지점 중 6지점, 최악 광고 299px 중 69px).
 * 여기서 고정하는 것은 **광고를 피하는 규칙이 아니라 댓글 맥락 규칙**이다.
 */
import { describe, expect, it } from 'vitest'
import {
  LONG_DOC_MIN_SCREENS,
  MIN_SCROLL_RATIO,
  NEAR_VIEWPORT_RATIO,
  READ_PROGRESS_THRESHOLD,
  resolveDockVisibility,
} from '@/lib/comment-dock-visibility'

const VH = 800

/** 긴 글: 스크롤 가능 높이 = 화면 5개분 */
const LONG_DOC = VH + VH * 5
/** 짧은 글: 스크롤 가능 높이 = 화면 1개분 (긴 글 기준 3개에 못 미침) */
const SHORT_DOC = VH + VH * 1

function at(o: Partial<Parameters<typeof resolveDockVisibility>[0]>) {
  return resolveDockVisibility({
    inputTop: 5000,
    inputBottom: 5200,
    viewportHeight: VH,
    scrollY: 0,
    documentHeight: LONG_DOC,
    ...o,
  })
}

describe('상수', () => {
  it('의도한 값으로 고정한다', () => {
    expect(MIN_SCROLL_RATIO).toBe(0.5)
    expect(NEAR_VIEWPORT_RATIO).toBe(0.8)
    expect(LONG_DOC_MIN_SCREENS).toBe(3)
    expect(READ_PROGRESS_THRESHOLD).toBe(0.75)
  })
})

describe('글 초반 — 뜨지 않는다 (이번 보정의 핵심)', () => {
  it('스크롤 0에서는 뜨지 않는다', () => {
    const r = at({ scrollY: 0 })
    expect(r.visible).toBe(false)
    expect(r.reason).toBe('too_early')
  })

  it('재현된 최악 지점(scrollY=129, 뷰포트 844)에서 뜨지 않는다', () => {
    const r = resolveDockVisibility({
      inputTop: 4200, inputBottom: 4500, viewportHeight: 844, scrollY: 129, documentHeight: 6003,
    })
    expect(r.visible).toBe(false)
    expect(r.reason).toBe('too_early')
  })

  it('화면 절반을 스크롤하기 전까지는 댓글이 가까워도 뜨지 않는다', () => {
    // 입력창이 바로 아래(근접)인데도 스크롤이 모자라면 안 뜬다
    const justBefore = at({ scrollY: VH * MIN_SCROLL_RATIO - 1, inputTop: VH + 10, inputBottom: VH + 300 })
    expect(justBefore.visible).toBe(false)
    expect(justBefore.reason).toBe('too_early')

    const justAfter = at({ scrollY: VH * MIN_SCROLL_RATIO, inputTop: VH + 10, inputBottom: VH + 300 })
    expect(justAfter.visible).toBe(true)
    expect(justAfter.reason).toBe('near_comment')
  })
})

describe('짧은 글 — 즉시 노출되지 않는다', () => {
  it('짧은 글 첫 화면에서는 뜨지 않는다', () => {
    const r = at({ documentHeight: SHORT_DOC, scrollY: 0, inputTop: VH + 50, inputBottom: VH + 350 })
    expect(r.visible).toBe(false)
    expect(r.reason).toBe('too_early')
  })

  it('짧은 글은 진행률 75%만으로는 뜨지 않는다 — 근접해야 뜬다', () => {
    const scrollable = SHORT_DOC - VH
    // 75%를 넘겼지만 입력창은 아직 멀리 있다
    const r = at({
      documentHeight: SHORT_DOC,
      scrollY: Math.ceil(scrollable * 0.8),
      inputTop: VH * 3,       // 근접 범위(1.8화면) 밖
      inputBottom: VH * 3 + 300,
    })
    expect(r.visible).toBe(false)
    expect(r.reason).toBe('not_near_yet')
  })

  it('짧은 글도 댓글 영역이 가까워지면 뜬다', () => {
    const r = at({
      documentHeight: SHORT_DOC,
      scrollY: VH * MIN_SCROLL_RATIO + 10,
      inputTop: VH + 100,
      inputBottom: VH + 400,
    })
    expect(r.visible).toBe(true)
    expect(r.reason).toBe('near_comment')
  })
})

describe('긴 글 — 충분히 읽으면 뜬다', () => {
  it('긴 글에서 75% 이상 읽으면 입력창이 멀어도 뜬다', () => {
    const scrollable = LONG_DOC - VH
    const r = at({
      scrollY: Math.ceil(scrollable * READ_PROGRESS_THRESHOLD),
      inputTop: VH * 3,        // 근접 범위 밖
      inputBottom: VH * 3 + 300,
    })
    expect(r.visible).toBe(true)
    expect(r.reason).toBe('read_enough')
  })

  it('75%에 못 미치고 근접도 아니면 뜨지 않는다', () => {
    const scrollable = LONG_DOC - VH
    const r = at({
      scrollY: Math.floor(scrollable * 0.6),
      inputTop: VH * 3,
      inputBottom: VH * 3 + 300,
    })
    expect(r.visible).toBe(false)
    expect(r.reason).toBe('not_near_yet')
  })
})

describe('입력창 상태 우선순위', () => {
  it('입력창이 화면에 보이면 무조건 숨긴다 (입력창 2개 방지 — C1-A부터 유지)', () => {
    const r = at({ scrollY: 3000, inputTop: 100, inputBottom: 400 })
    expect(r.visible).toBe(false)
    expect(r.inputInView).toBe(true)
    expect(r.reason).toBe('input_in_view')
  })

  it('입력창을 지나쳤으면 숨긴다 — 아래는 광고·추천글 구간이라 덮으면 안 된다', () => {
    const scrollable = LONG_DOC - VH
    const r = at({
      scrollY: Math.ceil(scrollable * 0.95),   // 진행률 75%는 넘었지만
      inputTop: -900, inputBottom: -600,        // 입력창은 이미 위로 지나갔다
    })
    expect(r.visible).toBe(false)
    expect(r.reason).toBe('scrolled_past')
  })

  it('inputInView는 Dock 노출 여부와 별개로 계산된다 (배너 지연 신호용)', () => {
    expect(at({ scrollY: 0, inputTop: 100, inputBottom: 400 }).inputInView).toBe(true)
    expect(at({ scrollY: 0, inputTop: 5000, inputBottom: 5200 }).inputInView).toBe(false)
  })
})

describe('경계', () => {
  it('근접 경계는 화면 높이의 1.8배 지점이다', () => {
    const base = { scrollY: VH, documentHeight: LONG_DOC }
    const inside = at({ ...base, inputTop: VH * (1 + NEAR_VIEWPORT_RATIO), inputBottom: VH * 2.5 })
    expect(inside.reason).toBe('near_comment')
    const outside = at({ ...base, inputTop: VH * (1 + NEAR_VIEWPORT_RATIO) + 1, inputBottom: VH * 2.5 })
    expect(outside.visible).toBe(false)
  })

  it('스크롤 불가 문서에서도 터지지 않는다', () => {
    const r = resolveDockVisibility({
      inputTop: 900, inputBottom: 1000, viewportHeight: VH, scrollY: 0, documentHeight: VH,
    })
    expect(r.visible).toBe(false)
  })
})
