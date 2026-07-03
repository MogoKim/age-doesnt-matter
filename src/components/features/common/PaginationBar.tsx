'use client'

import { useState, useEffect, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

// 근처 페이지 번호(현재 중심 3개, [1,total] 클램프). 우리 또래 가독성 위해 3개 중심으로 간소화.
function getNearby(current: number, total: number): number[] {
  const start = Math.min(Math.max(current - 1, 1), Math.max(1, total - 2))
  const nums: number[] = []
  for (let i = 0; i < 3 && start + i <= total; i++) nums.push(start + i)
  return nums
}

// 모바일 목록 하단 페이지 이동 v1 — 큰 터치·큰 글씨. 맨뒤 없음(끝은 직접 입력), "N/총" 표시 없음.
//  1줄(메인): (이전) · (맨앞) · [현재쪽 입력] · 이동 · (다음)   — 불가능한 액션(첫: 이전·맨앞 / 끝: 다음)은 숨김(disabled 버튼 미노출)
//  2줄(근처): ‹묶음 · [현재±1 번호 최대 3개] · ›묶음   (묶음 이동은 ±3, 화살표에 aria-label)
export default function PaginationBar({ currentPage, totalPages, buildHref }: Props) {
  const router = useRouter()
  const [jump, setJump] = useState(String(currentPage))
  useEffect(() => { setJump(String(currentPage)) }, [currentPage])

  if (totalPages <= 1) return null

  const isFirst = currentPage <= 1
  const isLast = currentPage >= totalPages
  const nums = getNearby(currentPage, totalPages)
  const hasPrevBunch = nums[0] > 1
  const hasNextBunch = nums[nums.length - 1] < totalPages
  const prevBunch = Math.max(1, currentPage - 3)
  const nextBunch = Math.min(totalPages, currentPage + 3)

  // v1.2 B3 구분 카드: 조작부를 연한 트레이로 묶고 버튼은 소프트칩(연회색 채움·테두리 0). 강조는 근처 줄 현재 페이지 코랄만.
  const box = 'h-[52px] rounded-lg text-base font-medium transition-colors flex items-center justify-center'
  const on = 'bg-muted text-foreground hover:bg-muted/80 active:bg-muted/60'
  // 간격은 고정 px(px-[11px]/gap-[4px])로 — rem이면 글씨 확대 시 간격까지 커져 오버플로. 폰트만 커지고 간격은 유지되게.
  const txt = 'px-[11px] shrink-0'
  const sq = 'w-[52px] shrink-0'

  function handleJump(e: FormEvent) {
    e.preventDefault()
    const n = parseInt(jump, 10)
    if (!Number.isFinite(n)) return
    router.push(buildHref(Math.min(Math.max(n, 1), totalPages)))
  }

  return (
    <nav aria-label="페이지 이동" className="mt-5 rounded-[18px] bg-muted/50 px-[8px] py-[18px]">
      {/* 메인 이동 줄: (이전) · (맨앞) · 현재쪽 입력 · 이동 · (다음) — 불가능한 액션은 숨김 */}
      <form onSubmit={handleJump} className="flex items-center justify-center gap-[3px]">
        {!isFirst && (
          <Link href={buildHref(currentPage - 1)} rel="prev" className={`${box} ${txt} ${on}`}>이전</Link>
        )}

        {!isFirst && (
          <Link href={buildHref(1)} aria-label="맨 앞 페이지로" className={`${box} ${txt} ${on}`}>맨앞</Link>
        )}

        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={jump}
          onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
          aria-label={`이동할 페이지 번호 (1부터 ${totalPages}). 현재 ${currentPage} 페이지`}
          className="h-[52px] w-[52px] shrink-0 rounded-lg border border-border/70 bg-background text-center text-base font-medium text-foreground outline-none transition-colors focus:border-primary/50"
        />

        <button type="submit" className={`${box} ${txt} ${on}`}>이동</button>

        {!isLast && (
          <Link href={buildHref(currentPage + 1)} rel="next" className={`${box} ${txt} ${on}`}>다음</Link>
        )}
      </form>

      {/* 근처 번호 줄: ‹묶음 · 번호 · ›묶음 */}
      <div className="mt-4 flex items-center justify-center gap-[10px]">
        {hasPrevBunch && (
          <Link href={buildHref(prevBunch)} aria-label="이전 페이지 묶음" className={`${box} ${sq} ${on}`}>
            <span className="text-xl leading-none">‹</span>
          </Link>
        )}
        {nums.map((n) =>
          n === currentPage ? (
            <span key={n} aria-current="page" className={`${box} ${sq} bg-primary font-semibold text-white`}>{n}</span>
          ) : (
            <Link key={n} href={buildHref(n)} aria-label={`${n} 페이지`} className={`${box} ${sq} ${on}`}>{n}</Link>
          )
        )}
        {hasNextBunch && (
          <Link href={buildHref(nextBunch)} aria-label="다음 페이지 묶음" className={`${box} ${sq} ${on}`}>
            <span className="text-xl leading-none">›</span>
          </Link>
        )}
      </div>
    </nav>
  )
}
