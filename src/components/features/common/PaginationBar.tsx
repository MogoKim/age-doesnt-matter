'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

// 모바일 목록 하단 페이지 이동 v1 — 우리 또래 친화(큰 터치·큰 글씨, 현재 페이지 명확).
//  1줄: « 맨앞 · ‹ 이전 · [현재 N / 총] · 다음 › · 맨뒤 »  (첫/끝은 비활성)
//  2줄: 페이지 직접 이동(input + 가기)
export default function PaginationBar({ currentPage, totalPages, buildHref }: Props) {
  const router = useRouter()
  const [jump, setJump] = useState('')

  if (totalPages <= 1) return null

  const isFirst = currentPage <= 1
  const isLast = currentPage >= totalPages

  // 52px 터치 타겟. 아이콘 버튼=정사각, 텍스트 버튼(이전/다음)=조금 넓게.
  const box = 'h-[52px] rounded-xl border text-base font-bold transition-colors flex items-center justify-center gap-1'
  const active = 'border-border text-foreground hover:border-primary/40 active:bg-primary/10'
  const disabled = 'border-border/60 text-muted-foreground/40 pointer-events-none'
  const iconBtn = 'w-[52px] shrink-0'
  const textBtn = 'px-2.5 shrink-0'

  function handleJump(e: FormEvent) {
    e.preventDefault()
    const n = parseInt(jump, 10)
    if (!Number.isFinite(n)) return
    const target = Math.min(Math.max(n, 1), totalPages)
    setJump('')
    router.push(buildHref(target))
  }

  return (
    <nav aria-label="페이지 이동" className="mt-6">
      {/* 1줄: 맨앞 · 이전 · 현재 · 다음 · 맨뒤 */}
      <div className="flex items-center justify-center gap-1.5">
        {isFirst ? (
          <span className={`${box} ${iconBtn} ${disabled}`} aria-hidden="true"><span className="text-xl leading-none">«</span></span>
        ) : (
          <Link href={buildHref(1)} aria-label="맨 앞으로" className={`${box} ${iconBtn} ${active}`}><span className="text-xl leading-none">«</span></Link>
        )}

        {isFirst ? (
          <span className={`${box} ${textBtn} ${disabled}`} aria-hidden="true"><span className="text-lg leading-none">‹</span>이전</span>
        ) : (
          <Link href={buildHref(currentPage - 1)} rel="prev" className={`${box} ${textBtn} ${active}`}><span className="text-lg leading-none">‹</span>이전</Link>
        )}

        {/* 현재 페이지 — 코랄 강조, 큰 글씨 */}
        <div
          role="status"
          aria-label={`현재 ${currentPage} 페이지, 전체 ${totalPages} 페이지`}
          className="h-[52px] min-w-[92px] shrink-0 flex items-center justify-center gap-1 rounded-xl border-[1.5px] border-primary/40 bg-primary/10 px-3"
        >
          <b className="text-xl font-extrabold text-primary-text leading-none">{currentPage}</b>
          <span className="text-caption font-semibold text-muted-foreground">/ {totalPages}</span>
        </div>

        {isLast ? (
          <span className={`${box} ${textBtn} ${disabled}`} aria-hidden="true">다음<span className="text-lg leading-none">›</span></span>
        ) : (
          <Link href={buildHref(currentPage + 1)} rel="next" className={`${box} ${textBtn} ${active}`}>다음<span className="text-lg leading-none">›</span></Link>
        )}

        {isLast ? (
          <span className={`${box} ${iconBtn} ${disabled}`} aria-hidden="true"><span className="text-xl leading-none">»</span></span>
        ) : (
          <Link href={buildHref(totalPages)} aria-label="맨 뒤로" className={`${box} ${iconBtn} ${active}`}><span className="text-xl leading-none">»</span></Link>
        )}
      </div>

      {/* 2줄: 페이지 직접 이동 */}
      <form onSubmit={handleJump} className="mt-2.5 flex items-center justify-center gap-2">
        <label htmlFor="page-jump" className="text-caption text-muted-foreground">페이지 이동</label>
        <input
          id="page-jump"
          inputMode="numeric"
          pattern="[0-9]*"
          value={jump}
          onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="쪽"
          aria-label={`이동할 페이지 번호 (1부터 ${totalPages})`}
          className="h-[52px] w-[76px] rounded-xl border border-border bg-background text-center text-base font-bold text-foreground outline-none transition-colors focus:border-primary/60"
        />
        <button type="submit" className="h-[52px] shrink-0 rounded-xl border border-border bg-background px-5 text-base font-bold text-foreground transition-colors hover:border-primary/40 active:bg-primary/10">
          가기
        </button>
      </form>
    </nav>
  )
}
