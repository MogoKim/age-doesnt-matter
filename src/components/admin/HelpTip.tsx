'use client'

import { useState, useRef, useEffect } from 'react'

interface HelpTipProps {
  text: string
}

export default function HelpTip({ text }: HelpTipProps) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  // 외부 클릭 시 닫기 (모바일)
  useEffect(() => {
    if (!show) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [show])

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
        aria-label="도움말"
      >
        ?
      </button>
      {show && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-normal rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
          style={{ maxWidth: 240, minWidth: 140 }}
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
        </span>
      )}
    </span>
  )
}
