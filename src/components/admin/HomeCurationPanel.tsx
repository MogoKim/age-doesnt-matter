'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { HomeCurationAdminView, CurationOverrideView } from '@/lib/queries/admin/admin.home-curation'
import type { HomeSectionsResult } from '@/lib/queries/posts/posts.home-compose'
import {
  createHomeCurationOverride,
  deactivateHomeCurationOverride,
  reorderHomeCurationPin,
  searchCurationPostsAction,
  type DurationPreset,
} from '@/lib/actions/admin/admin.home-curation'

type SectionKey = 'TRENDING' | 'STORIES' | 'HUMOR'
type ActionType = 'PIN' | 'HIDE'

interface SearchResult {
  id: string
  title: string
  boardType: string
  likeCount: number
  commentCount: number
  authorNickname: string
}

const SECTION_LABELS: Record<SectionKey, string> = {
  TRENDING: '지금뜨는이야기',
  STORIES: '사는이야기',
  HUMOR: '웃음방',
}

const BOARD_LABELS: Record<string, string> = {
  STORY: '사는이야기',
  HUMOR: '웃음방',
  LIFE2: '2막준비',
}

const DURATION_LABELS: Record<DurationPreset, string> = {
  FOUR_HOURS:  '4시간',
  EIGHT_HOURS: '8시간',
  TODAY:       '오늘 자정(KST)',
  MANUAL:      '수동 해제 시까지',
}

const MAX_COUNTS: Record<SectionKey, number> = {
  TRENDING: 10,
  STORIES:  5,
  HUMOR:    5,
}

interface Props {
  initial: HomeCurationAdminView
  preview: HomeSectionsResult
}

export default function HomeCurationPanel({ initial, preview }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeSection, setActiveSection] = useState<SectionKey>('TRENDING')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedAction, setSelectedAction] = useState<ActionType>('PIN')
  const [selectedDuration, setSelectedDuration] = useState<DurationPreset>('FOUR_HOURS')
  const [pendingPostId, setPendingPostId] = useState<string | null>(null)

  const sectionData = initial[activeSection]

  const previewPosts =
    activeSection === 'TRENDING'
      ? preview.trending
      : activeSection === 'STORIES'
        ? preview.stories
        : preview.humor

  // 경고 계산
  const trendingIds = new Set(preview.trending.map(p => p.id))
  const previewIds = new Set(previewPosts.map(p => p.id))
  const suppressedPins = sectionData.pins.filter(pin => !previewIds.has(pin.postId))
  const trendingOverlapPins =
    activeSection !== 'TRENDING'
      ? new Set(sectionData.pins.filter(pin => trendingIds.has(pin.postId)).map(p => p.postId))
      : new Set<string>()
  const maxCount = MAX_COUNTS[activeSection]
  const pinExceedsMax = sectionData.pins.length > maxCount

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    try {
      const results = await searchCurationPostsAction(searchQuery, activeSection)
      setSearchResults(results)
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddOverride = (postId: string) => {
    setPendingPostId(postId)
    startTransition(async () => {
      await createHomeCurationOverride({
        section: activeSection,
        postId,
        action: selectedAction,
        duration: selectedDuration,
      })
      setSearchResults([])
      setSearchQuery('')
      setPendingPostId(null)
      router.refresh()
    })
  }

  const handleDeactivate = (overrideId: string) => {
    startTransition(async () => {
      await deactivateHomeCurationOverride(overrideId)
      router.refresh()
    })
  }

  const handleMoveUp = (pins: CurationOverrideView[], index: number) => {
    if (index === 0) return
    const newOrder = [...pins]
    ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
    startTransition(async () => {
      await reorderHomeCurationPin(activeSection, newOrder.map(p => p.postId))
      router.refresh()
    })
  }

  const handleMoveDown = (pins: CurationOverrideView[], index: number) => {
    if (index === pins.length - 1) return
    const newOrder = [...pins]
    ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    startTransition(async () => {
      await reorderHomeCurationPin(activeSection, newOrder.map(p => p.postId))
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Section tabs */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(SECTION_LABELS) as SectionKey[]).map(section => (
          <button
            key={section}
            onClick={() => { setActiveSection(section); setSearchResults([]) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === section
                ? 'bg-primary text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {SECTION_LABELS[section]}
          </button>
        ))}
      </div>

      {/* 경고 배너 */}
      <div className="space-y-2">
        {preview.trending.length < 10 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
            ⚠️ 뜨는 이야기 자동 편성이 10개 미만입니다 ({preview.trending.length}개)
          </div>
        )}
        {preview.stories.length < 5 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
            ⚠️ 사는이야기 자동 편성이 5개 미만입니다 ({preview.stories.length}개)
          </div>
        )}
        {preview.humor.length < 5 && (
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
            ⚠️ 웃음방 자동 편성이 5개 미만입니다 ({preview.humor.length}개)
          </div>
        )}
        {pinExceedsMax && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-800">
            ⚠️ {SECTION_LABELS[activeSection]} PIN 수({sectionData.pins.length}개)가 최대치({maxCount}개)를 초과합니다
          </div>
        )}
        {suppressedPins.length > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
            ℹ️ {SECTION_LABELS[activeSection]}에서 PIN {suppressedPins.length}개가 중복 제거로 인해 실제 홈에 표시되지 않습니다
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* PIN 목록 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">
            📌 고정 게시글 <span className="font-normal text-zinc-400">({sectionData.pins.length}개)</span>
          </h3>
          {sectionData.pins.length === 0 ? (
            <p className="text-sm text-zinc-400 italic py-2">고정된 게시글 없음</p>
          ) : (
            <div className="space-y-2">
              {sectionData.pins.map((pin, idx) => (
                <div key={pin.id}>
                  <div
                    className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs font-bold text-blue-500 w-4 shrink-0 text-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{pin.postTitle}</p>
                      <p className="text-xs text-zinc-400">
                        {BOARD_LABELS[pin.postBoardType] ?? pin.postBoardType}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => handleMoveUp(sectionData.pins, idx)}
                        disabled={isPending || idx === 0}
                        className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 disabled:opacity-25 text-sm"
                        title="위로"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveDown(sectionData.pins, idx)}
                        disabled={isPending || idx === sectionData.pins.length - 1}
                        className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 disabled:opacity-25 text-sm"
                        title="아래로"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => handleDeactivate(pin.id)}
                        disabled={isPending}
                        className="ml-1 text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded disabled:opacity-50"
                      >
                        해제
                      </button>
                    </div>
                  </div>
                  {trendingOverlapPins.has(pin.postId) && (
                    <p className="mt-0.5 ml-6 text-xs text-orange-600">
                      이 글은 지금 뜨는 이야기에서 노출 중이라 이 섹션에서는 표시되지 않습니다.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HIDE 목록 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">
            🚫 이 섹션에서 숨김 <span className="font-normal text-zinc-400">({sectionData.hides.length}개)</span>
          </h3>
          {sectionData.hides.length === 0 ? (
            <p className="text-sm text-zinc-400 italic py-2">이 섹션에서 숨김 처리된 게시글 없음</p>
          ) : (
            <div className="space-y-2">
              {sectionData.hides.map(hide => (
                <div
                  key={hide.id}
                  className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{hide.postTitle}</p>
                    <p className="text-xs text-zinc-400">
                      {BOARD_LABELS[hide.postBoardType] ?? hide.postBoardType}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeactivate(hide.id)}
                    disabled={isPending}
                    className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded disabled:opacity-50 shrink-0"
                  >
                    해제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 게시글 추가 */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-3">게시글 추가</h3>

          {/* Action 선택 */}
          <div className="flex gap-2 mb-3">
            {(['PIN', 'HIDE'] as ActionType[]).map(action => (
              <button
                key={action}
                onClick={() => setSelectedAction(action)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedAction === action
                    ? action === 'PIN'
                      ? 'bg-blue-600 text-white'
                      : 'bg-red-600 text-white'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                }`}
              >
                {action === 'PIN' ? '📌 고정' : '🚫 이 섹션에서 숨김'}
              </button>
            ))}
          </div>

          {/* Duration 선택 */}
          <div className="mb-3">
            <label className="block text-xs text-zinc-500 mb-1">유지 기간</label>
            <select
              value={selectedDuration}
              onChange={e => setSelectedDuration(e.target.value as DurationPreset)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              {(Object.keys(DURATION_LABELS) as DurationPreset[]).map(d => (
                <option key={d} value={d}>{DURATION_LABELS[d]}</option>
              ))}
            </select>
          </div>

          {/* 검색 폼 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={`${SECTION_LABELS[activeSection]} 게시글 검색...`}
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-2 text-sm bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 shrink-0"
            >
              {isSearching ? '...' : '검색'}
            </button>
          </div>

          {/* 검색 결과 */}
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-80 overflow-y-auto">
              {searchResults.map(post => (
                <div
                  key={post.id}
                  className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800 truncate">{post.title}</p>
                    <p className="text-xs text-zinc-400">
                      {BOARD_LABELS[post.boardType] ?? post.boardType} · 공감 {post.likeCount}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAddOverride(post.id)}
                    disabled={isPending && pendingPostId === post.id}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold shrink-0 disabled:opacity-50 ${
                      selectedAction === 'PIN'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                  >
                    {selectedAction === 'PIN' ? '고정' : '이 섹션에서 숨김'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !isSearching && (
            <p className="mt-2 text-xs text-zinc-400">검색 결과 없음</p>
          )}
        </div>
      </div>

      {/* 현재 홈 편성 미리보기 */}
      <details className="border border-zinc-200 rounded-xl" open={false}>
        <summary className="px-4 py-3 text-sm font-semibold text-zinc-600 cursor-pointer select-none">
          현재 자동 편성 미리보기 — {SECTION_LABELS[activeSection]} ({previewPosts.length}개)
        </summary>
        <ul className="px-4 pb-4 mt-2 space-y-1">
          {previewPosts.map((p, i) => (
            <li key={p.id} className="flex items-baseline gap-2">
              <span className="text-xs text-zinc-400 w-5 text-right shrink-0">{i + 1}</span>
              <span className="text-xs text-zinc-700 truncate">{p.title}</span>
            </li>
          ))}
          {previewPosts.length === 0 && (
            <li className="text-xs text-zinc-400 italic">자동 후보 없음</li>
          )}
        </ul>
      </details>

      {isPending && (
        <div className="fixed bottom-6 right-6 bg-zinc-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
          처리 중...
        </div>
      )}
    </div>
  )
}
