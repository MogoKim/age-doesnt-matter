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
  LIST_HEADER: '목록 상단 띠',
  POST_BOTTOM: '글 하단',
  MOBILE_STICKY: '모바일 스티키',
  MAGAZINE_CPS: '매거진 CPS',
}

// 실제 화면 렌더 코드가 있는 슬롯만 폼/필터 드롭다운에 노출 (나머지는 등록해도 안 나오는 유령 슬롯)
// 현재 DB 광고를 실제 렌더하는 건 LIST_HEADER(ListBanner) 하나뿐.
// (HOME_INLINE은 AdInline 컴포넌트가 어디에도 연결돼 있지 않아 제외)
const ACTIVE_SLOTS: string[] = ['LIST_HEADER']

// LIST_HEADER(목록 상단 띠) 노출 위치 — targetPath(콤마 구분 다중 경로 / 빈=전체 공통)
const LIST_HEADER_PAGES: { value: string; label: string }[] = [
  { value: '/best', label: '베스트' },
  { value: '/community/stories', label: '사는이야기' },
  { value: '/community/life2', label: '2막준비' },
  { value: '/community/humor', label: '웃음방' },
  { value: '/magazine', label: '매거진' },
  { value: '/jobs', label: '내일찾기' },
]

function parseTargetPaths(csv: string): string[] {
  return csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : []
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
  targetPath: string | null
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

// Date → KST 'YYYY-MM-DDTHH:mm' (datetime-local 입력값)
function toKstInput(date: Date | string): string {
  const d = new Date(date)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16)
}
// datetime-local(KST 벽시계) → +09:00 명시 ISO (서버 UTC 오해석 방지)
function kstInputToIso(v: string): string {
  return v ? `${v}:00+09:00` : ''
}
// Date → KST 'YYYY-MM-DD HH:mm' (테이블 표시)
function formatKst(date: Date | string): string {
  const d = new Date(date)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

export default function AdBannerTable({ ads, hasMore, activeTab, currentSlot }: AdBannerTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    slot: 'LIST_HEADER' as AdSlot,
    adType: 'SELF' as AdType,
    title: '',
    imageUrl: '',
    htmlCode: '',
    clickUrl: '',
    targetPath: '',
    startDate: toKstInput(new Date()),
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

  async function handleImageUpload(file: File) {
    setUploading(true)
    try {
      // 서버 경유 업로드 (브라우저가 R2에 직접 PUT하지 않아 CORS 무관)
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/uploads/banner', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? '업로드 실패 (JPG·PNG·WebP, 4MB 이하)')
        return
      }
      const { publicUrl } = await res.json() as { publicUrl: string }
      setForm((f) => ({ ...f, imageUrl: publicUrl }))
    } catch {
      alert('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const EMPTY_FORM = {
    slot: 'LIST_HEADER' as AdSlot,
    adType: 'SELF' as AdType,
    title: '',
    imageUrl: '',
    htmlCode: '',
    clickUrl: '',
    targetPath: '',
    startDate: toKstInput(new Date()),
    endDate: '',
    priority: 0,
  }

  function handleEdit(ad: Ad) {
    setForm({
      slot: ad.slot as AdSlot,
      adType: ad.adType as AdType,
      title: ad.title ?? '',
      imageUrl: ad.imageUrl ?? '',
      htmlCode: ad.htmlCode ?? '',
      clickUrl: ad.clickUrl ?? '',
      targetPath: ad.targetPath ?? '',
      startDate: toKstInput(ad.startDate),
      endDate: toKstInput(ad.endDate),
      priority: ad.priority,
    })
    setEditingId(ad.id)
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      if (editingId) {
        await adminUpdateAdBanner(editingId, {
          slot: form.slot,
          adType: form.adType,
          title: form.title || undefined,
          imageUrl: form.imageUrl || undefined,
          htmlCode: form.htmlCode || undefined,
          clickUrl: form.clickUrl || undefined,
          targetPath: form.targetPath || undefined,
          startDate: kstInputToIso(form.startDate),
          endDate: kstInputToIso(form.endDate),
          priority: form.priority,
        })
      } else {
        await adminCreateAdBanner({
          slot: form.slot,
          adType: form.adType,
          title: form.title || undefined,
          imageUrl: form.imageUrl || undefined,
          htmlCode: form.htmlCode || undefined,
          clickUrl: form.clickUrl || undefined,
          targetPath: form.targetPath || undefined,
          startDate: kstInputToIso(form.startDate),
          endDate: kstInputToIso(form.endDate),
          priority: form.priority,
        })
      }
      handleCancel()
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

      {/* 운영 가이드 — 광고 슬롯 탭 (신입 담당자 필독) */}
      {activeTab === 'ads' && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1.5">
          <p className="font-semibold">📋 광고 슬롯 운영 가이드 (담당자 필독)</p>
          <ul className="space-y-1 list-none pl-0 text-blue-700">
            <li>• <strong>목록 상단 띠</strong>: 6개 목록 페이지(베스트·사는이야기·2막준비·웃음방·매거진·내일찾기) 메뉴 바로 아래에 노출</li>
            <li>• <strong>노출 위치</strong>: 여러 페이지 복수 선택 가능 — 전부 또는 0개 선택 = 6개 전체 공통</li>
            <li>• <strong>이미지</strong>: 권장 1200×400(3:1) 가로 띠 — 파일 선택하면 자동 업로드</li>
            <li>• <strong>광고 유형</strong>: 자체(우리 배너 이미지) / 구글·쿠팡(HTML 코드) / 외부</li>
            <li>• <strong>클릭 URL</strong>: 우나어 내부 주소는 같은 탭, 외부(https://)는 새 탭으로 열림</li>
            <li>• <strong>노출 조건</strong>: 활성 ON + 현재 시각이 시작~종료 사이 (한국 시간 KST 기준)</li>
            <li>• 최대 <strong>3개</strong>까지 자동 슬라이드 · CTR = 클릭÷노출×100 · 각 칸의 <strong>?</strong>에 마우스를 올리면 설명이 나옵니다</li>
          </ul>
        </div>
      )}

      {/* 슬롯 필터 + 추가 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={currentSlot || ''}
          onChange={(e) => updateFilter('slot', e.target.value)}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 슬롯</option>
          {ACTIVE_SLOTS.map((key) => (
            <option key={key} value={key}>{SLOT_LABELS[key]}</option>
          ))}
        </select>

        {!showForm && (
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true) }}
            className="ml-auto rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + 광고 추가
          </button>
        )}
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900">{editingId ? '광고 수정' : '새 광고 등록'}</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">슬롯 * <HelpTip text={HELP.AD_SLOT} /></label>
              <select
                value={form.slot}
                onChange={(e) => setForm({ ...form, slot: e.target.value as AdSlot })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm"
              >
                {ACTIVE_SLOTS.map((key) => (
                  <option key={key} value={key}>{SLOT_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">광고 유형 * <HelpTip text={HELP.AD_TYPE} /></label>
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
              <label className="mb-1 block text-xs font-medium text-zinc-600">제목 <HelpTip text={HELP.AD_TITLE} /></label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">클릭 URL <HelpTip text={HELP.AD_CLICK_URL} /></label>
              <input
                value={form.clickUrl}
                onChange={(e) => setForm({ ...form, clickUrl: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            {(form.adType === 'GOOGLE' || form.adType === 'COUPANG') ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600">광고 HTML 코드 <HelpTip text={HELP.AD_HTML_CODE} /></label>
                <textarea
                  value={form.htmlCode}
                  onChange={(e) => setForm({ ...form, htmlCode: e.target.value })}
                  rows={4}
                  placeholder="구글 애드센스 / 쿠팡 광고 HTML 코드 붙여넣기"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500"
                />
                <p className="mt-1 text-[11px] text-zinc-500">&lt;script&gt; 등 위험 태그는 저장 시 자동 제거됩니다.</p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">이미지 <HelpTip text={HELP.AD_IMAGE} /></label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }}
                  className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 disabled:opacity-50"
                />
                {uploading && <p className="mt-1 text-[11px] text-zinc-500">업로드 중…</p>}
                {form.slot === 'LIST_HEADER' && (
                  <p className="mt-1 text-[11px] text-zinc-500">권장 1200×400 (3:1 비율) · 가로로 긴 띠 이미지, 비율 벗어나면 위아래 잘릴 수 있음</p>
                )}
                <input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="또는 이미지 URL 직접 입력"
                  className="mt-2 h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                />
                {form.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt="배너 미리보기" className="mt-2 max-h-24 w-full rounded-lg border border-zinc-200 object-contain" />
                )}
              </div>
            )}

            {form.slot === 'LIST_HEADER' && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-600">노출 위치 (기본 전체 노출 · 원하는 목록만 켜고 끄기) <HelpTip text={HELP.AD_TARGET} /></label>
                <div className="flex flex-wrap gap-2">
                  {LIST_HEADER_PAGES.map((p) => {
                    const selected = parseTargetPaths(form.targetPath)
                    // 빈값(targetPath='') = 전체 공통 → 모든 칩을 켜진 상태로 표시
                    const isAll = selected.length === 0
                    const checked = isAll || selected.includes(p.value)
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => {
                          // 전체(빈값) 상태에서 끄기를 누르면 6개 전체를 기준으로 해당 칩만 제외
                          const base = isAll ? LIST_HEADER_PAGES.map((v) => v.value) : selected
                          const next = checked ? base.filter((v) => v !== p.value) : [...base, p.value]
                          // 6개 전부 켜짐(또는 0개로 떨어짐) = 전체 공통(빈 문자열). 0개 도달 시 자동 전체 복귀
                          const csv = next.length === 0 || next.length === LIST_HEADER_PAGES.length ? '' : next.join(',')
                          setForm({ ...form, targetPath: csv })
                        }}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                          checked
                            ? 'border-zinc-900 bg-zinc-900 text-white'
                            : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {parseTargetPaths(form.targetPath).length === 0
                    ? '현재: 전체 공통(6개 목록 모두 노출)'
                    : `현재: ${parseTargetPaths(form.targetPath).map((v) => LIST_HEADER_PAGES.find((p) => p.value === v)?.label).join(', ')} (${parseTargetPaths(form.targetPath).length}개)`}
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">우선순위 <HelpTip text={HELP.AD_PRIORITY} /></label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">시작일시 (KST) * <HelpTip text={HELP.AD_PERIOD} /></label>
              <input
                required
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">종료일시 (KST) *</label>
              <input
                required
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || uploading}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {editingId ? '수정 저장' : '등록'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
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
                    {ad.slot === 'LIST_HEADER' && (
                      <span className="mt-1 block text-[11px] text-zinc-400">
                        {parseTargetPaths(ad.targetPath ?? '').length === 0
                          ? '전체 공통'
                          : parseTargetPaths(ad.targetPath ?? '').map((v) => LIST_HEADER_PAGES.find((p) => p.value === v)?.label ?? v).join(', ')}
                      </span>
                    )}
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
                    {formatKst(ad.startDate)} ~ {formatKst(ad.endDate)}
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
                        onClick={() => handleEdit(ad)}
                        disabled={isPending}
                        className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        수정
                      </button>
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
