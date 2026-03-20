'use client'

import { useState } from 'react'

export default function CommentInput() {
  const [value, setValue] = useState('')

  function handleSubmit() {
    if (!value.trim()) return
    // TODO: API 연동
    alert('댓글 등록 기능은 API 연동 후 사용할 수 있어요.')
    setValue('')
  }

  return (
    <div className="flex items-end gap-2 p-4 bg-card border border-border rounded-2xl mt-6 shadow-sm max-md:sticky max-md:bottom-0 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
      <textarea
        className="flex-1 min-h-[44px] px-4 py-2.5 border border-border rounded-xl text-sm text-foreground bg-background resize-none outline-none transition-colors focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] placeholder:text-muted-foreground"
        placeholder="댓글을 남겨주세요..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
      />
      <button
        className="min-h-[52px] min-w-[72px] px-4 py-2.5 bg-primary text-white border-none rounded-xl text-xs font-bold cursor-pointer transition-all whitespace-nowrap hover:bg-[#E85D50] hover:shadow-[0_2px_8px_rgba(255,111,97,0.3)] disabled:bg-border disabled:cursor-not-allowed disabled:shadow-none"
        disabled={!value.trim()}
        onClick={handleSubmit}
      >
        등록
      </button>
    </div>
  )
}
