'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BestCurationAdminView } from '@/lib/queries/admin/admin.home-curation'
import type { PostSummary } from '@/types/api'
import {
  createHomeCurationOverride,
  deactivateHomeCurationOverride,
  reorderHomeCurationPin,
  setBestPinOrder,
  clearBestPins,
  searchCurationPostsAction,
  type DurationPreset,
} from '@/lib/actions/admin/admin.home-curation'

type SectionKey = 'BEST_HOT' | 'BEST_FAME'
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
  BEST_HOT: '🔥 뜨는 이야기',
  BEST_FAME: '👑 명예의 전당',
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

function promoBadge(level: string): { label: string; cls: string } | null {
  if (level === 'HALL_OF_FAME') return { label: '👑 전당', cls: 'bg-amber-100 text-amber-700' }
  if (level === 'HOT') return { label: '🔥 HOT', cls: 'bg-orange-100 text-orange-700' }
  return null
}

interface Props {
  initial: BestCurationAdminView
  previewHot: PostSummary[]
  previewFame: PostSummary[]
}

export default function BestCurationPanel({ initial, previewHot, previewFame }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeSection, setActiveSection] = useState<SectionKey>('BEST_HOT')
  const [duration, setDuration] = useState<DurationPreset>('MANUAL')

  // 검색-추가 (리스트에 없는 글 끌어오기 — 보조)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchAction, setSearchAction] = useState<ActionType>('PIN')

  const sectionData = initial[activeSection]
  const previewPosts = activeSection === 'BEST_HOT' ? previewHot : previewFame

  const pinByPostId = new Map(sectionData.pins.map(p => [p.postId, p]))
  const pinnedOrder = previewPosts.filter(p => pinByPostId.has(p.id)).map(p => p.id)
  const allPinned = previewPosts.length > 0 && pinnedOrder.length === previewPosts.length
  const isManaged = pinnedOrder.length > 0

  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh() })

  // 행 순서 이동 — 보이는 리스트 전체를 새 순서로 잠금(전체 고정). 이미 전부 고정이면 가벼운 reorder.
  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir
    if (to < 0 || to >= previewPosts.length) return
    const ids = previewPosts.map(p => p.id)
    ;[ids[idx], ids[to]] = [ids[to], ids[idx]]
    run(() => (allPinned ? reorderHomeCurationPin(activeSection, ids) : setBestPinOrder(activeSection, ids, duration)))
  }

  const hidePost = (postId: string) => run(() => createHomeCurationOverride({ section: activeSection, postId, action: 'HIDE', duration }))
  const clearOverride = (overrideId: string) => run(() => deactivateHomeCurationOverride(overrideId))
  const resetToAuto = () => run(() => clearBestPins(activeSection))

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    try {
      setSearchResults(await searchCurationPostsAction(searchQuery, activeSection))
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddFromSearch = (postId: string) => run(async () => {
    await createHomeCurationOverride({ section: activeSection, postId, action: searchAction, duration })
    setSearchResults([])
    setSearchQuery('')
  })

  return (
    <div className="space-y-5">
      {/* 탭 + 유지기간 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          {(Object.keys(SECTION_LABELS) as SectionKey[]).map(section => (
            <button
              key={section}
              onClick={() => { setActiveSection(section); setSearchResults([]); setSearchQuery('') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSection === section ? 'bg-primary text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {SECTION_LABELS[section]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">고정/숨김 유지</label>
          <select
            value={duration}
            onChange={e => setDuration(e.target.value as DurationPreset)}
            className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {(Object.keys(DURATION_LABELS) as DurationPreset[]).map(d => (
              <option key={d} value={d}>{DURATION_LABELS[d]}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        지금 <strong>/best {SECTION_LABELS[activeSection]}</strong>에 실제 노출되는 순서입니다. <strong>↑↓</strong>로 어느 줄이든 자유롭게 순서를 바꿀 수 있어요(처음 옮기면 현재 리스트가 그 순서로 잠깁니다). (반영 최대 60초)
      </p>

      {/* 관리 상태 + 되돌리기 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isManaged ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}>
          {isManaged ? `📌 직접 관리 중 (${pinnedOrder.length}개 고정)` : '⚙️ 자동 편성 (인기순)'}
        </span>
        {isManaged && (
          <button onClick={resetToAuto} disabled={isPending}
            className="text-xs text-zinc-500 hover:text-zinc-800 underline disabled:opacity-50">
            ↩︎ 자동 편성으로 되돌리기
          </button>
        )}
      </div>

      {/* 메인: 현재 베스트 노출 순서 */}
      <div className="border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 text-sm font-semibold text-zinc-700">
          현재 베스트 노출 순서 <span className="font-normal text-zinc-400">({previewPosts.length}개)</span>
        </div>
        {previewPosts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-400 text-center">표시할 게시글이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {previewPosts.map((post, idx) => {
              const pinned = pinByPostId.has(post.id)
              const badge = promoBadge(post.promotionLevel)
              return (
                <li key={post.id} className={`flex items-center gap-3 px-3 py-2.5 ${pinned ? 'bg-blue-50/60' : 'bg-white'}`}>
                  <span className={`w-6 shrink-0 text-center text-sm font-bold ${pinned ? 'text-blue-600' : 'text-zinc-400'}`}>{idx + 1}</span>

                  {post.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.thumbnailUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0 bg-zinc-100" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-zinc-100 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {pinned && <span className="text-[11px] font-bold text-blue-600 shrink-0">📌</span>}
                      {badge && <span className={`text-[11px] px-1 rounded shrink-0 ${badge.cls}`}>{badge.label}</span>}
                      <p className="text-sm font-medium text-zinc-800 truncate">{post.title}</p>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {BOARD_LABELS[post.boardType] ?? post.boardType} · {post.author.gradeEmoji}{post.author.nickname} · ❤️{post.likeCount} 💬{post.commentCount} 👁{post.viewCount}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => move(idx, -1)} disabled={isPending || idx === 0}
                      className="w-7 h-7 flex items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-100 disabled:opacity-25 text-sm" title="위로">↑</button>
                    <button onClick={() => move(idx, 1)} disabled={isPending || idx === previewPosts.length - 1}
                      className="w-7 h-7 flex items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-100 disabled:opacity-25 text-sm" title="아래로">↓</button>
                    <button onClick={() => hidePost(post.id)} disabled={isPending}
                      className="ml-0.5 text-xs bg-red-600 text-white hover:bg-red-700 px-2 py-1 rounded-lg font-semibold disabled:opacity-50">🚫 숨김</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 현재 숨긴 글 */}
      {sectionData.hides.length > 0 && (
        <div className="border border-red-100 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-sm font-semibold text-red-700">
            🚫 베스트에서 숨긴 글 <span className="font-normal text-red-400">({sectionData.hides.length}개)</span>
          </div>
          <ul className="divide-y divide-red-50">
            {sectionData.hides.map(hide => (
              <li key={hide.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700 truncate">{hide.postTitle}</p>
                  <p className="text-xs text-zinc-400">{BOARD_LABELS[hide.postBoardType] ?? hide.postBoardType}</p>
                </div>
                <button onClick={() => clearOverride(hide.id)} disabled={isPending}
                  className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded disabled:opacity-50 shrink-0">숨김해제</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 보조: 리스트에 없는 글 추가 */}
      <details className="border border-zinc-200 rounded-xl">
        <summary className="px-4 py-3 text-sm font-semibold text-zinc-600 cursor-pointer select-none">
          ＋ 리스트에 없는 글 검색해서 고정/숨김
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-3">
          <div className="flex gap-2">
            {(['PIN', 'HIDE'] as ActionType[]).map(action => (
              <button key={action} onClick={() => setSearchAction(action)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  searchAction === action
                    ? action === 'PIN' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                }`}>
                {action === 'PIN' ? '📌 맨 위 고정' : '🚫 숨김'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="게시글 제목 검색..."
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}
              className="px-3 py-2 text-sm bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 shrink-0">
              {isSearching ? '...' : '검색'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {searchResults.map(post => (
                <div key={post.id} className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-800 truncate">{post.title}</p>
                    <p className="text-xs text-zinc-400">{BOARD_LABELS[post.boardType] ?? post.boardType} · 공감 {post.likeCount}</p>
                  </div>
                  <button onClick={() => handleAddFromSearch(post.id)} disabled={isPending}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold shrink-0 disabled:opacity-50 text-white ${
                      searchAction === 'PIN' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                    }`}>
                    {searchAction === 'PIN' ? '고정' : '숨김'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !isSearching && (
            <p className="text-xs text-zinc-400">검색 결과 없음</p>
          )}
        </div>
      </details>

      {isPending && (
        <div className="fixed bottom-6 right-6 bg-zinc-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">처리 중...</div>
      )}
    </div>
  )
}
