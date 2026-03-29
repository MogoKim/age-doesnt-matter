'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { IconSearch } from '@/components/icons'
import { gtmSearch } from '@/lib/gtm'

const STORAGE_KEY = 'una-recent-searches'
const MAX_RECENT = 10

const FALLBACK_KEYWORDS = ['건강 관리', '일자리', '국내 여행', '연금', '밑반찬', '운동', '재테크', '취미']

const CATEGORY_QUICK_BUTTONS = [
  { label: '🏃 건강', query: '건강' },
  { label: '💼 일자리', query: '일자리' },
  { label: '✈️ 여행', query: '여행' },
  { label: '🍳 요리', query: '요리' },
  { label: '💰 재테크', query: '재테크' },
  { label: '🎨 취미', query: '취미' },
]

interface SearchFormProps {
  initialQuery?: string
  popularKeywords?: string[]
}

export default function SearchForm({ initialQuery = '', popularKeywords = [] }: SearchFormProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored))
      } catch {
        /* ignore */
      }
    }
    if (!initialQuery) {
      inputRef.current?.focus()
    }
  }, [initialQuery])

  function saveToRecent(keyword: string) {
    const updated = [keyword, ...recentSearches.filter((s) => s !== keyword)].slice(0, MAX_RECENT)
    setRecentSearches(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  function removeRecent(keyword: string) {
    const updated = recentSearches.filter((s) => s !== keyword)
    setRecentSearches(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  function clearAllRecent() {
    setRecentSearches([])
    localStorage.removeItem(STORAGE_KEY)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 2) return
    saveToRecent(q)
    gtmSearch(q)
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  function handleKeywordClick(keyword: string) {
    setQuery(keyword)
    saveToRecent(keyword)
    router.push(`/search?q=${encodeURIComponent(keyword)}`)
  }

  const showSuggestions = !initialQuery

  return (
    <div>
      {/* 검색 입력 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 p-4 bg-card border-b border-border w-full max-w-full overflow-hidden">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center justify-center w-[52px] h-[52px] text-lg text-foreground shrink-0"
          aria-label="뒤로가기"
        >
          ←
        </button>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어를 입력해 주세요"
          className="flex-1 min-w-0 h-12 px-4 bg-background border border-border rounded-xl text-body text-foreground outline-none transition-colors focus:border-primary placeholder:text-muted-foreground"
          aria-label="검색어 입력"
        />
        <button
          type="submit"
          className="flex items-center justify-center w-[52px] h-[52px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="검색"
        >
          <IconSearch size={22} />
        </button>
      </form>

      {/* 초기 상태: 최근검색어 + 인기검색어 */}
      {showSuggestions && (
        <div className="px-4 py-6">
          {/* 최근 검색어 */}
          {recentSearches.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-body font-bold text-foreground">최근 검색어</h3>
                <button
                  type="button"
                  onClick={clearAllRecent}
                  className="text-sm text-muted-foreground min-h-[52px] px-2"
                >
                  전체 삭제
                </button>
              </div>
              <ul className="space-y-1">
                {recentSearches.map((keyword) => (
                  <li key={keyword} className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleKeywordClick(keyword)}
                      className="flex-1 text-left text-body text-foreground py-3 min-h-[52px] px-2"
                    >
                      {keyword}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecent(keyword)}
                      className="flex items-center justify-center w-[52px] h-[52px] text-muted-foreground text-sm"
                      aria-label={`${keyword} 삭제`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 카테고리 퀵버튼 */}
          <section className="mb-8">
            <h3 className="text-body font-bold text-foreground mb-4">카테고리로 찾기</h3>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_QUICK_BUTTONS.map((cat) => (
                <button
                  key={cat.query}
                  type="button"
                  onClick={() => handleKeywordClick(cat.query)}
                  className="inline-flex items-center min-h-[52px] px-4 rounded-full border border-border bg-background text-foreground transition-colors hover:border-primary hover:text-primary lg:min-h-[48px]"
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </section>

          {/* 인기 검색어 (없으면 fallback) */}
          {(() => {
            const keywords = popularKeywords.length > 0 ? popularKeywords : FALLBACK_KEYWORDS
            return (
              <section>
                <h3 className="text-body font-bold text-foreground mb-4 flex items-center gap-1.5">
                  🔥 {popularKeywords.length > 0 ? '인기 검색어' : '추천 검색어'}
                </h3>
                <ol className="space-y-1">
                  {keywords.map((keyword, idx) => (
                    <li key={keyword}>
                      <button
                        type="button"
                        onClick={() => handleKeywordClick(keyword)}
                        className="flex items-center gap-3 w-full text-left py-3 min-h-[52px] px-2"
                      >
                        <span className="text-body font-bold text-primary w-6 text-center">
                          {idx + 1}
                        </span>
                        <span className="text-body text-foreground">{keyword}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )
          })()}
        </div>
      )}
    </div>
  )
}
