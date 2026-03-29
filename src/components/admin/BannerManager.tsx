'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminCreateBanner, adminUpdateBanner, adminDeleteBanner } from '@/lib/actions/admin'
import HelpTip from './HelpTip'
import { HELP } from './admin-help-texts'

interface Banner {
  id: string
  title: string
  description: string | null
  imageUrl: string
  linkUrl: string | null
  startDate: Date
  endDate: Date
  priority: number
  isActive: boolean
}

interface BannerManagerProps {
  banners: Banner[]
  activeTab: string
}

const TAB_ITEMS = [
  { value: 'hero', label: '히어로 배너' },
  { value: 'ads', label: '광고 슬롯' },
]

function formatDate(date: Date) {
  return new Date(date).toISOString().split('T')[0]
}

function isActiveNow(banner: Banner) {
  const now = new Date()
  return banner.isActive && new Date(banner.startDate) <= now && new Date(banner.endDate) >= now
}

export default function BannerManager({ banners, activeTab }: BannerManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    imageUrl: '',
    linkUrl: '',
    startDate: formatDate(new Date()),
    endDate: '',
    priority: 0,
  })

  function resetForm() {
    setForm({
      title: '',
      description: '',
      imageUrl: '',
      linkUrl: '',
      startDate: formatDate(new Date()),
      endDate: '',
      priority: 0,
    })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(banner: Banner) {
    setForm({
      title: banner.title,
      description: banner.description || '',
      imageUrl: banner.imageUrl,
      linkUrl: banner.linkUrl || '',
      startDate: formatDate(banner.startDate),
      endDate: formatDate(banner.endDate),
      priority: banner.priority,
    })
    setEditId(banner.id)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      if (editId) {
        await adminUpdateBanner(editId, {
          title: form.title,
          description: form.description || undefined,
          imageUrl: form.imageUrl,
          linkUrl: form.linkUrl || undefined,
          startDate: form.startDate,
          endDate: form.endDate,
          priority: form.priority,
        })
      } else {
        await adminCreateBanner({
          title: form.title,
          description: form.description || undefined,
          imageUrl: form.imageUrl,
          linkUrl: form.linkUrl || undefined,
          startDate: form.startDate,
          endDate: form.endDate,
          priority: form.priority,
        })
      }
      resetForm()
    })
  }

  function handleDelete(bannerId: string) {
    if (!confirm('이 배너를 삭제하시겠습니까?')) return
    startTransition(() => adminDeleteBanner(bannerId))
  }

  function handleToggleActive(banner: Banner) {
    startTransition(() =>
      adminUpdateBanner(banner.id, { isActive: !banner.isActive })
    )
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

      {/* 추가 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          히어로 배너 최대 3장. 우선순위(낮은 숫자가 먼저)로 정렬됩니다.
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + 배너 추가
          </button>
        )}
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900">
            {editId ? '배너 수정' : '새 배너 등록'}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">제목 *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">설명</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">이미지 URL *</label>
              <input
                required
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">링크 URL</label>
              <input
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">시작일 *</label>
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
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">우선순위 <HelpTip text={HELP.BANNER_PRIORITY} /></label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
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
              {editId ? '수정' : '등록'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 배너 리스트 */}
      <div className="space-y-3">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`flex items-center gap-4 rounded-xl border bg-white p-4 ${
              isActiveNow(banner) ? 'border-green-200' : 'border-zinc-200 opacity-60'
            }`}
          >
            {/* 미리보기 */}
            <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={banner.imageUrl}
                alt={banner.title}
                className="h-full w-full object-cover"
              />
            </div>

            {/* 정보 */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900">{banner.title}</span>
                {isActiveNow(banner) && (
                  <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                    노출중
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatDate(banner.startDate)} ~ {formatDate(banner.endDate)} · 우선순위 {banner.priority}
              </p>
            </div>

            {/* 액션 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleToggleActive(banner)}
                disabled={isPending}
                className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                  banner.isActive
                    ? 'text-yellow-600 hover:bg-yellow-50'
                    : 'text-green-600 hover:bg-green-50'
                }`}
              >
                {banner.isActive ? '비활성' : '활성'} <HelpTip text={HELP.BANNER_ACTIVE} />
              </button>
              <button
                onClick={() => startEdit(banner)}
                className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                수정
              </button>
              <button
                onClick={() => handleDelete(banner.id)}
                disabled={isPending}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
        {banners.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
            등록된 히어로 배너가 없습니다.
          </div>
        )}
      </div>
    </>
  )
}
