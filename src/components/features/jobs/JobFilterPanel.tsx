'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const REGIONS = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
const WORK_TIMES = ['오전', '오후', '풀타임']
const CONDITIONS = ['나이무관', '초보환영', '주3일', '주5일']

interface JobFilterPanelProps {
  onClose: () => void
}

export default function JobFilterPanel({ onClose }: JobFilterPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [region, setRegion] = useState(searchParams.get('region') ?? '')
  const [tags, setTags] = useState<string[]>(
    searchParams.get('tags')?.split(',').filter(Boolean) ?? []
  )

  // ESC로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }, [])

  const handleApply = () => {
    const params = new URLSearchParams()
    if (region) params.set('region', region)
    if (tags.length > 0) params.set('tags', tags.join(','))
    router.push(`${pathname}?${params.toString()}`)
    onClose()
  }

  const handleReset = () => {
    setRegion('')
    setTags([])
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-card rounded-t-3xl lg:rounded-3xl w-full max-w-[480px] max-h-[85vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="sticky top-0 bg-card px-6 pt-6 pb-3 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">필터</h2>
          <button
            className="text-sm text-muted-foreground cursor-pointer min-h-[44px] px-2 hover:text-primary transition-colors"
            onClick={handleReset}
          >
            초기화
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 지역 */}
          <div>
            <h3 className="text-base font-bold text-foreground mb-3">지역</h3>
            <div className="flex flex-wrap gap-2">
              <button
                className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] cursor-pointer transition-all border ${
                  !region ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border'
                }`}
                onClick={() => setRegion('')}
              >
                전체
              </button>
              {REGIONS.map((r) => (
                <button
                  key={r}
                  className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] cursor-pointer transition-all border ${
                    region === r ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border'
                  }`}
                  onClick={() => setRegion(region === r ? '' : r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* 근무 시간 */}
          <div>
            <h3 className="text-base font-bold text-foreground mb-3">근무 시간</h3>
            <div className="flex flex-wrap gap-2">
              {WORK_TIMES.map((t) => (
                <button
                  key={t}
                  className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] cursor-pointer transition-all border ${
                    tags.includes(t) ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border'
                  }`}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 조건 */}
          <div>
            <h3 className="text-base font-bold text-foreground mb-3">조건</h3>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] cursor-pointer transition-all border ${
                    tags.includes(c) ? 'bg-primary text-white border-primary' : 'bg-card text-muted-foreground border-border'
                  }`}
                  onClick={() => toggleTag(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-card px-6 py-4 border-t border-border">
          <button
            className="w-full h-[52px] bg-primary text-white rounded-xl font-bold text-base cursor-pointer hover:bg-primary/90 transition-colors"
            onClick={handleApply}
          >
            필터 적용하기
          </button>
        </div>
      </div>
    </div>
  )
}
