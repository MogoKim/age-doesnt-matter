'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// Metadata는 server component에서만 export 가능 — 별도 layout에서 처리
// export const metadata: Metadata = { title: 'Naver 블로그 발행 큐' }

interface QueueItem {
  queueId: string
  title: string
  category: string
  targetTime: string
  status: string
  imageUrls?: string[]
}

function formatKST(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NaverBlogQueuePage() {
  const router = useRouter()
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/naver-queue', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { items: QueueItem[] }
      setItems(data.items)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItems()
    const id = setInterval(() => { void fetchItems() }, 5000)
    return () => clearInterval(id)
  }, [fetchItems])

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Naver 발행 대기</h1>
        {items.length > 0 && (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FF6F61] text-white text-xs font-bold">
            {items.length}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">로딩 중...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-zinc-400 text-sm">발행 대기 중인 글이 없습니다</p>
          <p className="text-zinc-300 text-xs mt-1">매거진 발행 후 자동으로 추가됩니다</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map(item => (
            <li key={item.queueId}>
              <button
                type="button"
                onClick={() => router.push(`/admin/naver-blog/${item.queueId}`)}
                className="w-full flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left hover:border-[#FF6F61] hover:bg-orange-50 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-sm text-zinc-900 line-clamp-1">{item.title}</span>
                  <span className="text-xs text-zinc-400">
                    {item.category} · {formatKST(item.targetTime)}
                    {item.imageUrls && item.imageUrls.length > 0 && (
                      <> · 🖼️ {item.imageUrls.length}개</>
                    )}
                  </span>
                </div>
                <span className="text-zinc-300 text-sm ml-4">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-zinc-300">5초마다 자동 갱신</p>
    </div>
  )
}
