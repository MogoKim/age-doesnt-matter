'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'

interface BlogSection {
  heading: string | null
  body: string
  isQuote: boolean
}

interface BlogContent {
  blogTitle: string
  sections: BlogSection[]
  hashtags: string[]
  geoKeyword: string | null
  imagePrompts: string[]
}

interface QueueItem {
  queueId: string
  title: string
  category: string
  targetTime: string
  status: string
  transformedContent?: BlogContent
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

function buildFullBodyText(sections: BlogSection[]): string {
  return sections
    .map(s => {
      const lines: string[] = []
      if (s.heading) lines.push(s.heading)
      lines.push(s.body)
      return lines.join('\n\n')
    })
    .join('\n\n\n')
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

function CopyButton({
  text,
  label = '복사',
  size = 'sm',
}: {
  text: string
  label?: string
  size?: 'sm' | 'md'
}) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    await copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const base =
    size === 'md'
      ? 'px-4 py-2 text-sm font-medium rounded-lg'
      : 'px-3 py-1.5 text-xs font-medium rounded-md'

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${base} transition-colors ${
        copied
          ? 'bg-green-100 text-green-700'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
      }`}
    >
      {copied ? '✅ 복사됨' : `📋 ${label}`}
    </button>
  )
}

export default function NaverBlogDetailPage() {
  const router = useRouter()
  const params = useParams()
  const queueId = params.queueId as string

  const [item, setItem] = useState<QueueItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/naver-queue/${queueId}`, { cache: 'no-store' })
      if (!res.ok) { router.push('/admin/naver-blog'); return }
      const data = await res.json() as { item: QueueItem }
      setItem(data.item)
    } catch { router.push('/admin/naver-blog') } finally {
      setLoading(false)
    }
  }, [queueId, router])

  useEffect(() => { void fetchItem() }, [fetchItem])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/naver-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId }),
      })
      if (res.ok) router.push('/admin/naver-blog')
    } finally {
      setDeleting(false)
      setShowConfirm(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">로딩 중...</div>
  }

  if (!item) return null

  const content = item.transformedContent
  const images = item.imageUrls ?? []
  const hashtagText = content?.hashtags.join(' ') ?? ''
  const fullBodyText = content ? buildFullBodyText(content.sections) : ''

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/naver-blog')}
          className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          ← 목록
        </button>
        <span className="text-zinc-200">|</span>
        <span className="text-xs text-zinc-400">
          {item.category} · {formatKST(item.targetTime)}
        </span>
      </div>

      {/* 제목 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">블로그 제목</h2>
          <CopyButton text={content?.blogTitle ?? item.title} label="제목 복사" />
        </div>
        <p className="text-base font-medium text-zinc-900 leading-snug">
          {content?.blogTitle ?? item.title}
        </p>
      </section>

      {/* 본문 */}
      {content && content.sections.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">본문</h2>
            <CopyButton text={fullBodyText} label="전체 복사" size="md" />
          </div>

          <div className="space-y-3">
            {content.sections.map((section, i) => {
              const sectionText = [section.heading, section.body]
                .filter(Boolean)
                .join('\n\n')
              return (
                <div
                  key={i}
                  className={`rounded-lg p-4 ${
                    section.isQuote
                      ? 'border-l-4 border-[#FF6F61] bg-orange-50'
                      : 'bg-zinc-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {section.heading && (
                        <p className="text-sm font-semibold text-zinc-800">{section.heading}</p>
                      )}
                      <p className="text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
                        {section.body}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <CopyButton text={sectionText} label="복사" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 해시태그 */}
      {hashtagText && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">해시태그</h2>
            <CopyButton text={hashtagText} label="해시태그 복사" />
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">{hashtagText}</p>
        </section>
      )}

      {/* 이미지 */}
      {images.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              이미지 {images.length}개
            </h2>
            <span className="text-xs text-zinc-300">클릭 → 새 탭에서 저장</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {images.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square rounded-lg overflow-hidden border border-zinc-100 hover:border-[#FF6F61] transition-colors"
              >
                <Image
                  src={url}
                  alt={`이미지 ${i + 1}`}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-200"
                  sizes="(max-width: 768px) 30vw, 200px"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                  <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
                    {i + 1}번 열기
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 발행 완료 버튼 */}
      <div className="pt-2 pb-8">
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="w-full h-14 rounded-xl bg-[#FF6F61] text-white font-semibold text-base hover:bg-[#E85D50] transition-colors"
        >
          ✅ 발행 완료
        </button>
      </div>

      {/* 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-zinc-900">발행 완료 확인</h3>
            <p className="text-sm text-zinc-600">
              네이버 블로그에 발행을 완료하셨나요?<br />
              확인 후 대기 목록에서 삭제됩니다.
            </p>
            <p className="text-xs text-zinc-400 bg-zinc-50 rounded-lg p-3 line-clamp-2">
              {content?.blogTitle ?? item.title}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl bg-[#FF6F61] text-white font-semibold text-sm hover:bg-[#E85D50] transition-colors disabled:opacity-50"
              >
                {deleting ? '처리 중...' : '발행 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
