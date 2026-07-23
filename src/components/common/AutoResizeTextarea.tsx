'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react'

interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 자동 높이 상한(px). 초과 시 내부 스크롤. 기본 200 */
  maxHeight?: number
}

/**
 * 입력량에 따라 높이가 자동 조절되는 textarea — 댓글/답글/의견 입력 공통.
 * value 변경 시 scrollHeight로 높이를 맞추되 maxHeight를 넘지 않게 하고,
 * 넘으면 내부 세로 스크롤로 전환한다. style.height만 바꾸므로 포커스·커서가 유지된다.
 *
 * ⚠️ 반드시 모듈 최상위 컴포넌트로 사용(부모 함수 본문 내 재정의 금지 — remount로 포커스 상실).
 */
const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(function AutoResizeTextarea(
  { maxHeight = 200, value, onChange, style, rows = 1, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement)

  const resize = () => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  // value(제어값) 변경 시마다 높이 재계산 — 입력/삭제/붙여넣기/외부 리셋 모두 반영
  useEffect(resize, [value, maxHeight])

  return (
    <textarea
      ref={innerRef}
      value={value}
      rows={rows}
      onChange={onChange}
      style={{ resize: 'none', ...style }}
      {...rest}
    />
  )
})

export default AutoResizeTextarea
