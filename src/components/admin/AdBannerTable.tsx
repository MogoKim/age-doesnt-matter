'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminCreateAdBanner, adminUpdateAdBanner, adminDeleteAdBanner } from '@/lib/actions/admin'
import type { AdSlot, AdType } from '@/generated/prisma/client'
import HelpTip from './HelpTip'
import { HELP } from './admin-help-texts'

const TAB_ITEMS = [
  { value: 'hero', label: '히어로 배너' },
  { value: 'ads', label: '광고 슬롯' },
]

const SLOT_LABELS: Record<string, string> = {
  HERO: '히어로',
  HOME_INLINE: '홈 인라인',
  SIDEBAR: '사이드바',
  LIST_INLINE: '목록 인라인',
  POST_BOTTOM: '글 하단',
  MOBILE_STICKY: '모바일 스티키',
  MAGAZINE_CPS: '매거진 CPS',
}

const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  SELF: { label: '자체', className: 'bg-blue-50 text-blue-700' },
  GOOGLE: { label: '구글', className: 'bg-green-50 text-green-700' },
  COUPANG: { label: '쿠팡', className: 'bg-orange-50 text-orange-700' },
  EXTERNAL: { label: '외부', className: 'bg-purple-50 text-purple-700' },
}

interface Ad {
  id: string
  slot: string
  adType: string
  title: string | null
  imageUrl: string | null
  htmlCode: string | null
  clickUrl: string | null
  startDate: Date
  endDate: Date
  priority: number
  impressions: number
  clicks: number
  isActive: boolean
  createdAt: Date
}

interface AdBannerTableProps {
  ads: Ad[]
  hasMore: boolean
  activeTab: string
  currentSlot?: string
}

function formatDate(date: Date) {
  return new Date(date).toISOString().split('T')[0]
}

export default function AdBannerTable({ ads, hasMore, activeTab, currentSlot }: AdBannerTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    slot: 'HOME_INLINE' as AdSlot,
    adType: 'SELF' as AdType,
    title: '',
    imageUrl: '',
    htmlCode: '',
    clickUrl: '',
    startDate: formatDate(new Date()),
    endDate: '',
    priority: 0,
  })

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'ads')
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('cursor')
    router.push(`/admin/banners?${params.toString()}`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await adminCreateAdBanner({
        slot: form.slot,
        adType: form.adType,
        title: form.title || undefined,
        imageUrl: form.imageUrl || undefined,
        htmlCode: form.htmlCode || undefined,
        clickUrl: form.clickUrl || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        priority: form.priority,
      })
      setShowForm(false)
    })
  }

  function handleToggle(ad: Ad) {
    startTransition(() => adminUpdateAdBanner(ad.id, { isActive: !ad.isActive }))
  }

  function handleDelete(adId: string) {
    if (!confirm('이 광고를 삭제하시겠습니까?')) return
    startTransition(() => adminDeleteAdBanner(adId))
  }

  return (
    <>
      {/* 탭 */}
      <div className="flex gap-2">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => router.push(`/admin/banners?tab=${tab.value}`)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 슬롯 필터 + 추가 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={currentSlot || ''}
          onChange={(e) => updateFilter('slot', e.target.value)}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 슬롯</option>
          {Object.entries(SLOT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + 광고 추가
          </button>
        )}
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900">새 광고 등록</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">슬롯 * <HelpTip text={HELP.AD_SLOT} /></label>
              <select
                value={form.slot}
                onChange={(e) => setForm({ ...form, slot: e.target.value as AdSlot })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              >
                {Object.entries(SLOT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">광고 유형 *</label>
              <select
                value={form.adType}
                onChange={(e) => setForm({ ...form, adType: e.target.value as AdType })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              >
                {Object.entries(TYPE_LABELS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">제목</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">클릭 URL</label>
              <input
                value={form.clickUrl}
                onChange={(e) => setForm({ ...form, clickUrl: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">이미지 URL</label>
              <input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">우선순위</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">시작일 * </label>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">종료일 *</label>
              <input
                required
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              등록
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left font-medium text-zinc-600">슬롯</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">유형</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">제목</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">기간</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">순위</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">노출</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">클릭</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">CTR <HelpTip text={HELP.AD_CTR} /></th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상태</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">액션</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => {
              const typeInfo = TYPE_LABELS[ad.adType] || TYPE_LABELS.SELF
              const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0'
              return (
                <tr key={ad.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {SLOT_LABELS[ad.slot] || ad.slot}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${typeInfo.className}`}>
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-3 text-zinc-900">
                    {ad.title || '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">
                    {formatDate(ad.startDate)} ~ {formatDate(ad.endDate)}
                  </td>
                  <td className="px-3 py-3 text-center text-zinc-600">{ad.priority}</td>
                  <td className="px-3 py-3 text-center text-zinc-600">{ad.impressions.toLocaleString()}</td>
                  <td className="px-3 py-3 text-center text-zinc-600">{ad.clicks.toLocaleString()}</td>
                  <td className="px-3 py-3 text-center text-zinc-600">{ctr}%</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                      ad.isActive ? 'bg-green-50 text-green-700' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {ad.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleToggle(ad)}
                        disabled={isPending}
                        className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                          ad.isActive
                            ? 'text-yellow-600 hover:bg-yellow-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {ad.isActive ? 'OFF' : 'ON'}
                      </button>
                      <button
                        onClick={() => handleDelete(ad.id)}
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
            {ads.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-zinc-500">
                  등록된 광고가 없습니다.
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
              const lastAd = ads[ads.length - 1]
              if (!lastAd) return
              const params = new URLSearchParams(searchParams.toString())
              params.set('cursor', new Date(lastAd.createdAt).toISOString())
              router.push(`/admin/banners?${params.toString()}`)
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
