'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminCreateBanner, adminUpdateBanner, adminDeleteBanner } from '@/lib/actions/admin'
import HelpTip from './HelpTip'
import { HELP } from './admin-help-texts'

interface Banner {
  id: string
  title: string
  subtitle: string | null
  themeColor: string
  themeColorMid: string | null
  themeColorEnd: string | null
  ctaText: string | null
  ctaUrl: string | null
  displayOrder: number
  slot: string
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
}

interface BannerManagerProps {
  banners: Banner[]
  activeTab: string
}

const TAB_ITEMS = [
  { value: 'hero', label: '히어로 배너' },
  { value: 'ads', label: '광고 슬롯' },
]

function formatDate(date: Date | null | undefined) {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}

function buildGradient(color: string, mid?: string | null, end?: string | null) {
  if (end && mid) return `linear-gradient(135deg, ${color}, ${mid}, ${end})`
  if (mid) return `linear-gradient(135deg, ${color}, ${mid})`
  return `linear-gradient(135deg, ${color}, ${color}dd)`
}

function isActiveNow(banner: Banner) {
  const now = new Date()
  if (!banner.isActive) return false
  if (banner.startsAt && new Date(banner.startsAt) > now) return false
  if (banner.endsAt && new Date(banner.endsAt) < now) return false
  return true
}

export default function BannerManager({ banners, activeTab }: BannerManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    themeColor: '#FF6F61',
    themeColorMid: '',
    themeColorEnd: '',
    ctaText: '',
    ctaUrl: '',
    displayOrder: 0,
    slot: 'HERO',
    startsAt: '',
    endsAt: '',
    isActive: true,
  })

  function resetForm() {
    setForm({
      title: '',
      subtitle: '',
      themeColor: '#FF6F61',
      themeColorMid: '',
      themeColorEnd: '',
      ctaText: '',
      ctaUrl: '',
      displayOrder: 0,
      slot: 'HERO',
      startsAt: '',
      endsAt: '',
      isActive: true,
    })
    setEditId(null)
    setShowForm(false)
  }

  function startEdit(banner: Banner) {
    setForm({
      title: banner.title,
      subtitle: banner.subtitle || '',
      themeColor: banner.themeColor || '#FF6F61',
      themeColorMid: banner.themeColorMid || '',
      themeColorEnd: banner.themeColorEnd || '',
      ctaText: banner.ctaText || '',
      ctaUrl: banner.ctaUrl || '',
      displayOrder: banner.displayOrder,
      slot: banner.slot,
      startsAt: formatDate(banner.startsAt),
      endsAt: formatDate(banner.endsAt),
      isActive: banner.isActive,
    })
    setEditId(banner.id)
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const payload = {
        title: form.title,
        subtitle: form.subtitle || undefined,
        themeColor: form.themeColor,
        themeColorMid: form.themeColorMid || undefined,
        themeColorEnd: form.themeColorEnd || undefined,
        ctaText: form.ctaText || undefined,
        ctaUrl: form.ctaUrl || undefined,
        displayOrder: form.displayOrder,
        slot: form.slot,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
        isActive: form.isActive,
      }
      if (editId) {
        await adminUpdateBanner(editId, payload)
      } else {
        await adminCreateBanner(payload)
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

      {/* 운영 가이드 */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1.5">
        <p className="font-semibold">📋 히어로 배너 운영 가이드 (담당자 필독)</p>
        <ul className="space-y-1 list-none pl-0 text-blue-700">
          <li>• 최대 <strong>5장</strong> 동시 노출 가능 — 표시순서 숫자가 낮을수록 먼저 표시</li>
          <li>• 배너 배경은 <strong>그라디언트 컬러</strong>로 설정 (이미지 없음)</li>
          <li>• 시작/종료일을 비워두면 <strong>항상 노출</strong>됩니다</li>
          <li>• <strong>노출 조건</strong>: 활성화 AND 현재 날짜가 시작일~종료일 사이</li>
          <li>• 배너가 없으면 폴백 슬라이드가 자동 표시됩니다</li>
        </ul>
      </div>

      {/* 추가 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          히어로 배너 최대 5장. 표시순서(낮은 숫자가 먼저)로 정렬됩니다.
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

          {/* 그라디언트 미리보기 */}
          <div
            className="h-20 w-full rounded-xl flex items-center justify-center text-white text-sm font-semibold shadow-inner"
            style={{ background: buildGradient(form.themeColor, form.themeColorMid, form.themeColorEnd) }}
          >
            <span className="drop-shadow">{form.title || '제목 미리보기'}</span>
            {form.subtitle && (
              <span className="ml-2 text-xs opacity-80">— {form.subtitle}</span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* 제목 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">제목 *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                placeholder="인생 2막, 지금 시작해요"
              />
            </div>

            {/* 부제목 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">부제목</label>
              <input
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                placeholder="우리 또래 이야기"
              />
            </div>

            {/* 그라디언트 색상 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                시작 컬러 * <HelpTip text="배너 배경 그라디언트의 시작 색상 (필수)" />
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.themeColor}
                  onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-300 p-1"
                />
                <input
                  value={form.themeColor}
                  onChange={(e) => setForm({ ...form, themeColor: e.target.value })}
                  className="h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm font-mono outline-none focus:border-zinc-500"
                  placeholder="#FF6F61"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">중간 컬러</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.themeColorMid || '#FF9F61'}
                  onChange={(e) => setForm({ ...form, themeColorMid: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-300 p-1"
                />
                <input
                  value={form.themeColorMid}
                  onChange={(e) => setForm({ ...form, themeColorMid: e.target.value })}
                  className="h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm font-mono outline-none focus:border-zinc-500"
                  placeholder="#FF9F61 (선택)"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">끝 컬러</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.themeColorEnd || '#FFD161'}
                  onChange={(e) => setForm({ ...form, themeColorEnd: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-300 p-1"
                />
                <input
                  value={form.themeColorEnd}
                  onChange={(e) => setForm({ ...form, themeColorEnd: e.target.value })}
                  className="h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm font-mono outline-none focus:border-zinc-500"
                  placeholder="#FFD161 (선택)"
                />
              </div>
            </div>

            {/* CTA */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">CTA 버튼 텍스트</label>
              <input
                value={form.ctaText}
                onChange={(e) => setForm({ ...form, ctaText: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                placeholder="지금 시작하기"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">CTA 링크 URL</label>
              <input
                value={form.ctaUrl}
                onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                placeholder="/community/stories"
              />
            </div>

            {/* 표시순서 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                표시순서 <HelpTip text={HELP.BANNER_PRIORITY} />
              </label>
              <input
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>

            {/* 슬롯 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">슬롯</label>
              <select
                value={form.slot}
                onChange={(e) => setForm({ ...form, slot: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500 bg-white"
              >
                <option value="HERO">HERO (홈 메인)</option>
              </select>
            </div>

            {/* 노출 기간 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                노출 시작일 <span className="text-zinc-400">(비워두면 즉시)</span>
              </label>
              <input
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                노출 종료일 <span className="text-zinc-400">(비워두면 무기한)</span>
              </label>
              <input
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>

            {/* 활성화 */}
            <div className="flex items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 cursor-pointer rounded border-zinc-300"
              />
              <label htmlFor="isActive" className="text-sm text-zinc-700 cursor-pointer">
                활성화 (노출 기간 내 홈 히어로에 표시)
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? '저장 중...' : editId ? '수정' : '등록'}
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
        {banners.map((banner) => {
          const active = isActiveNow(banner)
          return (
            <div
              key={banner.id}
              className={`flex items-center gap-4 rounded-xl border bg-white p-4 ${
                active ? 'border-green-200' : 'border-zinc-200 opacity-60'
              }`}
            >
              {/* 그라디언트 미리보기 */}
              <div
                className="h-16 w-28 flex-shrink-0 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shadow-inner"
                style={{ background: buildGradient(banner.themeColor, banner.themeColorMid, banner.themeColorEnd) }}
              >
                {banner.ctaText && <span className="drop-shadow px-1 text-center leading-tight">{banner.ctaText}</span>}
              </div>

              {/* 정보 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="truncate text-sm font-semibold text-zinc-900">{banner.title}</span>
                  {banner.subtitle && (
                    <span className="text-xs text-zinc-400 truncate">— {banner.subtitle}</span>
                  )}
                  {active && (
                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                      노출중
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {banner.startsAt ? formatDate(banner.startsAt) : '즉시'} ~{' '}
                  {banner.endsAt ? formatDate(banner.endsAt) : '무기한'} · 순서 {banner.displayOrder}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400 font-mono">{banner.themeColor}</p>
              </div>

              {/* 액션 */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleActive(banner)}
                  disabled={isPending}
                  title={banner.isActive ? '클릭 시 비활성화' : '클릭 시 활성화'}
                  className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                    banner.isActive
                      ? 'bg-green-50 text-green-700 hover:bg-red-50 hover:text-red-600'
                      : 'bg-zinc-100 text-zinc-500 hover:bg-green-50 hover:text-green-700'
                  }`}
                >
                  {banner.isActive ? '● 활성' : '○ 비활성'} <HelpTip text={HELP.BANNER_ACTIVE} />
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
          )
        })}
        {banners.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
            등록된 히어로 배너가 없습니다.
          </div>
        )}
      </div>
    </>
  )
}
