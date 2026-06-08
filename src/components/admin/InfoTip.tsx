'use client'

import { useState } from 'react'

/**
 * 지표 정의 툴팁 — ⓘ 아이콘에 hover(데스크탑) 또는 tap(모바일) 시 정의 말풍선.
 * 어드민 인사이트 등에서 각 숫자의 정의를 인라인으로 노출.
 */
export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center align-middle">
      <button
        type="button"
        aria-label="설명 보기"
        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-bold leading-none text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-zinc-800 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg"
        >
          {text}
          <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-zinc-800" />
        </span>
      )}
    </span>
  )
}
