'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminCreateBannedWord, adminDeleteBannedWord, adminToggleBannedWord } from '@/lib/actions/admin'
import type { BannedWordCategory } from '@/generated/prisma/client'

const CATEGORY_LABELS: Record<string, { label: string; className: string }> = {
  PROFANITY: { label: '욕설', className: 'bg-red-50 text-red-700' },
  POLITICS: { label: '정치', className: 'bg-blue-50 text-blue-700' },
  HATE: { label: '혐오', className: 'bg-orange-50 text-orange-700' },
  SPAM: { label: '스팸', className: 'bg-yellow-50 text-yellow-700' },
  ADULT: { label: '성인', className: 'bg-purple-50 text-purple-700' },
}

interface BannedWord {
  id: string
  word: string
  category: string
  isActive: boolean
  createdAt: Date
}

interface BannedWordPanelProps {
  words: BannedWord[]
  hasMore: boolean
  filters: {
    category?: string
    search?: string
  }
}

export default function BannedWordPanel({ words, hasMore, filters }: BannedWordPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [newWord, setNewWord] = useState('')
  const [newCategory, setNewCategory] = useState<BannedWordCategory>('PROFANITY')
  const [searchInput, setSearchInput] = useState(filters.search || '')

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'banned')
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('cursor')
    router.push(`/admin/settings?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateFilter('search', searchInput)
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newWord.trim()) return
    startTransition(async () => {
      await adminCreateBannedWord(newWord.trim(), newCategory)
      setNewWord('')
    })
  }

  function handleDelete(wordId: string) {
    if (!confirm('이 금지어를 삭제하시겠습니까?')) return
    startTransition(() => adminDeleteBannedWord(wordId))
  }

  function handleToggle(word: BannedWord) {
    startTransition(() => adminToggleBannedWord(word.id, !word.isActive))
  }

  return (
    <>
      {/* 추가 폼 */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">금지어</label>
          <input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="추가할 금지어"
            className="h-9 w-48 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">카테고리</label>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as BannedWordCategory)}
            className="h-9 rounded-lg border border-zinc-300 px-3 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending || !newWord.trim()}
          className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          추가
        </button>
      </form>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.category || ''}
          onChange={(e) => updateFilter('category', e.target.value)}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 카테고리</option>
          {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="금지어 검색"
            className="h-9 w-40 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            검색
          </button>
        </form>
      </div>

      {/* 리스트 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left font-medium text-zinc-600">금지어</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">카테고리</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상태</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">등록일</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">액션</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => {
              const cat = CATEGORY_LABELS[word.category] || CATEGORY_LABELS.PROFANITY
              return (
                <tr key={word.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{word.word}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cat.className}`}>
                      {cat.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                      word.isActive ? 'bg-green-50 text-green-700' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {word.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    {new Date(word.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleToggle(word)}
                        disabled={isPending}
                        className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                          word.isActive
                            ? 'text-yellow-600 hover:bg-yellow-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {word.isActive ? 'OFF' : 'ON'}
                      </button>
                      <button
                        onClick={() => handleDelete(word.id)}
                        disabled={isPending}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {words.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                  등록된 금지어가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => {
              const lastWord = words[words.length - 1]
              if (!lastWord) return
              const params = new URLSearchParams(searchParams.toString())
              params.set('cursor', new Date(lastWord.createdAt).toISOString())
              router.push(`/admin/settings?${params.toString()}`)
            }}
            className="rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            더보기
          </button>
        </div>
      )}
    </>
  )
}
