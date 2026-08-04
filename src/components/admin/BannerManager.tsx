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
  imageUrl: string | null
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
  { value: 'hero',      label: '히어로 배너' },
  { value: 'ads',       label: '광고 슬롯' },
  { value: 'top-promo', label: '최상단 띠 배너' },
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

function optionalText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
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
  const [uploading, setUploading] = useState(false)
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
    imageUrl: '',
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
      imageUrl: '',
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
      imageUrl: banner.imageUrl || '',
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
      const imageUrl = optionalText(form.imageUrl)
      const payload = {
        title: form.title.trim(),
        subtitle: optionalText(form.subtitle),
        themeColor: form.themeColor,
        themeColorMid: optionalText(form.themeColorMid),
        themeColorEnd: optionalText(form.themeColorEnd),
        ctaText: optionalText(form.ctaText),
        ctaUrl: optionalText(form.ctaUrl),
        ...(imageUrl !== null && { imageUrl }),
        displayOrder: form.displayOrder,
        slot: form.slot,
        startsAt: optionalText(form.startsAt),
        endsAt: optionalText(form.endsAt),
        isActive: form.isActive,
      }
      if (editId) {
        await adminUpdateBanner(editId, payload)
      } else {
        await adminCreateBanner(payload)
      }
      resetForm()
      router.refresh()
    })
  }

  async function handleImageUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/uploads/banner', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? '업로드 실패 (JPG·PNG·WebP, 4MB 이하)')
        return
      }
      const { publicUrl } = (await res.json()) as { publicUrl: string }
      setForm((f) => ({ ...f, imageUrl: publicUrl }))
    } catch {
      alert('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  function handleDelete(bannerId: string) {
    if (!confirm('이 배너를 삭제하시겠습니까?')) return
    startTransition(async () => {
      await adminDeleteBanner(bannerId)
      router.refresh()
    })
  }

  function handleToggleActive(banner: Banner) {
    startTransition(async () => {
      await adminUpdateBanner(banner.id, { isActive: !banner.isActive })
      router.refresh()
    })
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

      {/* 운영 가이드 — 히어로 탭 전용 */}
      {activeTab === 'hero' && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1.5">
          <p className="font-semibold">📋 히어로 배너 운영 가이드 (담당자 필독)</p>
          <ul className="space-y-1 list-none pl-0 text-blue-700">
            <li>• 최대 <strong>5장</strong> 동시 노출 가능 — 표시순서 숫자가 낮을수록 먼저 표시</li>
            <li>• 이미지가 있으면 <strong>이미지 배경 + 왼쪽 정렬</strong>, 없으면 그라디언트 배경으로 표시됩니다</li>
            <li>• 시작/종료일을 비워두면 <strong>항상 노출</strong>됩니다</li>
            <li>• <strong>노출 조건</strong>: 활성화 AND 현재 날짜가 시작일~종료일 사이</li>
            <li>• 배너가 없으면 홈 히어로 영역은 표시되지 않습니다</li>
          </ul>
        </div>
      )}

      {/* 추가 버튼 + 폼 — 히어로 탭 전용 */}
      {activeTab === 'hero' && (
        <>
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

          {/* 미리보기 */}
          <div
            className="relative h-28 w-full overflow-hidden rounded-xl bg-cover bg-center shadow-inner"
            style={{
              background: form.imageUrl
                ? `linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0.16)), url("${form.imageUrl}") center / cover`
                : buildGradient(form.themeColor, form.themeColorMid, form.themeColorEnd),
            }}
          >
            <div className={`flex h-full flex-col justify-center gap-1 px-6 text-white ${form.imageUrl ? 'items-start text-left' : 'items-center text-center'}`}>
              <span className="text-sm font-bold drop-shadow">{form.title || '제목 미리보기'}</span>
              {form.subtitle && (
                <span className="text-xs opacity-90 drop-shadow">{form.subtitle}</span>
              )}
            </div>
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
                placeholder="/community/stories 또는 https://example.com"
              />
              <p className="mt-1 text-xs text-zinc-500">
                내부는 <code>/</code>로 시작(앱 안에서 이동), 광고주 사이트는 <code>https://</code>(새 탭).
                <code>http://</code>·<code>javascript:</code> 등은 저장되지 않습니다. 비우면 홈으로 이동합니다.
              </p>
            </div>

            {/* 이미지 */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                이미지 <span className="text-zinc-400">(선택)</span>
              </label>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 space-y-1 text-xs text-zinc-500">
                  <p>
                    <strong className="text-zinc-700">권장 2400×900 (8:3 가로형)</strong> · 최소 1600×600 ·
                    JPG·PNG·WebP · 4MB 이하
                  </p>
                  <p>
                    화면 비율은 <strong>모바일 2:1</strong>, <strong>PC 8:3</strong>입니다. 모바일에서는{' '}
                    <strong>좌우 각 12.5%가 잘리므로</strong> 중요한 요소는 가운데 70%(가로 1680px) 안에 넣어주세요.
                  </p>
                  <p>
                    제목·부제·CTA는 시스템이 <strong>이미지 왼쪽에 겹쳐</strong> 출력합니다(왼쪽에 어두운 그라디언트).
                    로고·상품은 <strong>오른쪽</strong>에, 우하단 모서리는 슬라이드 카운터가 겹치니 비워주세요.
                  </p>
                  <p>
                    비율이 <strong>2.55:1 ~ 2.8:1</strong>을 벗어나면 업로드가 거부됩니다(세로형·정사각·2:1·3:1 등).
                    비우면 그라디언트 배경으로 표시됩니다.
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleImageUpload(file)
                  }}
                  className="block text-sm"
                />
                {uploading && <p className="mt-1 text-xs text-zinc-500">업로드 중…</p>}
                <input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  className="mt-2 h-10 w-full rounded-lg border border-zinc-300 px-3 font-mono text-sm outline-none focus:border-zinc-500"
                  placeholder="/images/hero/hero_1.jpg 또는 업로드 URL"
                />
              </div>
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
        </>
      )}

      {/* 배너 리스트 — 히어로 탭 전용 */}
      {activeTab === 'hero' && (
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
              {/* 배경 미리보기 */}
              <div
                className="h-16 w-28 flex-shrink-0 rounded-lg bg-cover bg-center shadow-inner"
                style={{
                  background: banner.imageUrl
                    ? `linear-gradient(to right, rgba(0,0,0,0.45), rgba(0,0,0,0.12)), url("${banner.imageUrl}") center / cover`
                    : buildGradient(banner.themeColor, banner.themeColorMid, banner.themeColorEnd),
                }}
              >
                <div className={`flex h-full items-center px-2 text-white text-[10px] font-bold ${banner.imageUrl ? 'justify-start text-left' : 'justify-center text-center'}`}>
                  {banner.ctaText && <span className="drop-shadow leading-tight">{banner.ctaText}</span>}
                </div>
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
                <p className="mt-0.5 text-xs text-zinc-400 font-mono">
                  {banner.imageUrl ? banner.imageUrl : banner.themeColor}
                </p>
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
                  {banner.isActive ? '● 활성' : '○ 비활성'}
                </button>
                <HelpTip text={HELP.BANNER_ACTIVE} />
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
      )}
    </>
  )
}
