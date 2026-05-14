'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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

// ── 복사 버튼 ──

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="text-xs px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors shrink-0"
    >
      {copied ? '✓ 복사됨' : label}
    </button>
  )
}

// ── 섹션 토글 헤더 ──

function SectionHeader({
  icon, title, isOpen, onClick,
}: { icon: string; title: string; isOpen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
    >
      <span className="text-sm font-medium text-zinc-700">{icon} {title}</span>
      <span className="text-xs text-zinc-400">{isOpen ? '▲' : '▼'}</span>
    </button>
  )
}

// ── 운영 가이드 ──

const UTM_MID = 'https://age-doesnt-matter.com/?utm_source=naver_blog&utm_medium=blog&utm_campaign=content_marketing&utm_content=banner_mid'
const UTM_END = 'https://age-doesnt-matter.com/?utm_source=naver_blog&utm_medium=blog&utm_campaign=content_marketing&utm_content=banner_end'

function OperationGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const [section, setSection] = useState<string | null>(null)

  const toggle = (s: string) => setSection(prev => prev === s ? null : s)

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 overflow-hidden">
      {/* 가이드 토글 헤더 */}
      <button
        type="button"
        onClick={() => { setIsOpen(o => !o); if (isOpen) setSection(null) }}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-zinc-50 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-zinc-600">ℹ️ 운영 가이드</span>
        <span className="text-xs text-zinc-400">{isOpen ? '▲ 닫기' : '▼ 펼치기'}</span>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 space-y-2 bg-white">

          {/* 📅 발행 스케줄 */}
          <SectionHeader icon="📅" title="발행 스케줄" isOpen={section === 'schedule'} onClick={() => toggle('schedule')} />
          {section === 'schedule' && (
            <div className="px-4 pb-2 text-xs text-zinc-600 space-y-1.5">
              <Row label="자동 실행" value="12:30 KST · 18:30 KST" />
              <Row label="일 최대" value="2건/일 (안정화 30일간: 1건/일)" />
              <Row label="1회 실행" value="최대 2건 (catch-up 1 + 정기 1)" />
              <Row label="만료 기한" value="PENDING 48시간 초과 → 자동 EXPIRED" />
              <Row label="HALT 조건" value="FAILED 항목 2건 이상 → 전면 차단" />
            </div>
          )}

          {/* ✍️ 콘텐츠 기준 */}
          <SectionHeader icon="✍️" title="콘텐츠 기준 (SEO)" isOpen={section === 'content'} onClick={() => toggle('content')} />
          {section === 'content' && (
            <div className="px-4 pb-2 text-xs text-zinc-600 space-y-1.5">
              <Row label="목표 글자수" value="1,800자 (최소 1,000 / 최대 6,000)" />
              <Row label="해시태그" value="5~10개" />
              <Row label="이미지" value="최소 6개 (썸네일 + 본문 + Gemini 생성)" />
              <Row label="외부 링크" value="최대 2개 (스팸 방지)" />
              <Row label="금지어" value="노인 · 할머니 · 시니어 · 어르신" highlight />
            </div>
          )}

          {/* 🔗 UTM 링크 */}
          <SectionHeader icon="🔗" title="UTM 링크 (복사)" isOpen={section === 'utm'} onClick={() => toggle('utm')} />
          {section === 'utm' && (
            <div className="px-4 pb-2 text-xs text-zinc-600 space-y-2">
              <div>
                <div className="text-zinc-400 mb-1">글 중간 띠배너용</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-zinc-50 rounded px-2 py-1.5 text-[11px] break-all">{UTM_MID}</code>
                  <CopyBtn text={UTM_MID} label="복사" />
                </div>
              </div>
              <div>
                <div className="text-zinc-400 mb-1">글 마지막 홍보 배너용</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-zinc-50 rounded px-2 py-1.5 text-[11px] break-all">{UTM_END}</code>
                  <CopyBtn text={UTM_END} label="복사" />
                </div>
              </div>
            </div>
          )}

          {/* 📊 GA4 추적 */}
          <SectionHeader icon="📊" title="GA4 추적 방법" isOpen={section === 'ga4'} onClick={() => toggle('ga4')} />
          {section === 'ga4' && (
            <div className="px-4 pb-2 text-xs text-zinc-600 space-y-1.5">
              <Row label="세션 수" value="획득 → 트래픽 획득 → utm_source: naver_blog" />
              <Row label="배너 비교" value="utm_content 필터: banner_mid vs banner_end" />
              <Row label="전환율" value="유입 후 가입 · 글쓰기 전환 (목표 설정 필요)" />
            </div>
          )}

          {/* ⚙️ 큐 상태 */}
          <SectionHeader icon="⚙️" title="큐 상태 설명" isOpen={section === 'status'} onClick={() => toggle('status')} />
          {section === 'status' && (
            <div className="px-4 pb-2 text-xs text-zinc-600 space-y-1.5">
              <Row label="PENDING" value="LLM 변환 + 이미지 생성 중 (이 페이지에 미표시)" />
              <Row label="READY_FOR_MANUAL" value="복사 발행 대기 ← 이 페이지에 표시" highlight />
              <Row label="FAILED" value="3회 시도 실패 → Slack 알림" />
              <Row label="EXPIRED" value="48시간 초과 자동 만료" />
            </div>
          )}

        </div>
      )}
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-zinc-400">{label}</span>
      <span className={highlight ? 'text-[#FF6F61] font-medium' : ''}>{value}</span>
    </div>
  )
}

// ── 메인 페이지 ──

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

      <OperationGuide />

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
