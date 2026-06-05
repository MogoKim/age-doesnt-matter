'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { JOB_SIDO_LIST } from '@/lib/jobs-regions'

interface JobRegionSheetProps {
  onClose: () => void
}

/**
 * JobRegionSheet — /jobs 필터 행의 "지역 ▼" 빠른 선택 시트
 * - 선택 즉시 `?region=` 적용 (기존 tags·q 보존, page 초기화)
 * - 필터 패널(JobFilterPanel)과 동일한 region URL param 공유 → 자동 동기화
 */
export default function JobRegionSheet({ onClose }: JobRegionSheetProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('region') ?? ''

  // ESC로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const select = (region: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (region) {
      params.set('region', region)
    } else {
      params.delete('region')
    }
    params.delete('page')
    const query = params.toString()
    router.push(query ? `/jobs?${query}` : '/jobs')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-card rounded-t-3xl lg:rounded-3xl w-full max-w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="sticky top-0 bg-card px-6 pt-6 pb-3 border-b border-border flex items-center justify-between">
          <h2 className="text-title font-bold text-foreground">지역 선택</h2>
          <button
            type="button"
            aria-label="지역 선택 닫기"
            onClick={onClose}
            className="flex items-center justify-center w-[52px] h-[52px] lg:w-11 lg:h-11 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 py-2 rounded-full text-body font-medium min-h-[52px] lg:min-h-[44px] cursor-pointer transition-all border ${
                !current ? 'bg-primary/10 text-primary-text border-primary' : 'bg-card text-foreground border-border'
              }`}
              onClick={() => select('')}
            >
              전체
            </button>
            {JOB_SIDO_LIST.map((r) => (
              <button
                key={r}
                className={`px-4 py-2 rounded-full text-body font-medium min-h-[52px] lg:min-h-[44px] cursor-pointer transition-all border ${
                  current === r ? 'bg-primary/10 text-primary-text border-primary' : 'bg-card text-foreground border-border'
                }`}
                onClick={() => select(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
