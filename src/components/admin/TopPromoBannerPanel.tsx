'use client'

import { useState, useTransition } from 'react'
import { adminUpdateTopPromoBanner } from '@/lib/actions/admin'

const TAG_MAX = 4
const TEXT_MAX = 20

interface TopPromoSettings {
  enabled: boolean
  tag: string
  text: string
  href: string
}

interface TopPromoBannerPanelProps {
  type: 'guest' | 'member'
  settings: TopPromoSettings
}

const TYPE_LABEL = {
  guest:  '비회원 배너',
  member: '회원 배너',
} as const

const TYPE_DESC = {
  guest:  '로그인 안 한 유저에게 표시 — 회원가입 유도에 활용',
  member: '로그인한 유저에게 표시 — 공지·이벤트·신기능 안내에 활용',
} as const

function detectHrefType(href: string): 'internal' | 'external' {
  return href.startsWith('https://') ? 'external' : 'internal'
}

export default function TopPromoBannerPanel({ type, settings }: TopPromoBannerPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    enabled:  settings.enabled,
    tag:      settings.tag,
    text:     settings.text,
    href:     settings.href,
    hrefType: detectHrefType(settings.href) as 'internal' | 'external',
  })

  function handleHrefTypeChange(hrefType: 'internal' | 'external') {
    const href = hrefType === 'internal' ? '/' : 'https://'
    setForm((f) => ({ ...f, hrefType, href }))
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await adminUpdateTopPromoBanner({
          type,
          enabled: form.enabled,
          tag:     form.tag,
          text:    form.text,
          href:    form.href,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패')
      }
    })
  }

  const previewBg = 'linear-gradient(90deg, #C4453B 0%, #FF6F61 50%, #FFB4A2 100%)'

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* 섹션 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50">
        <p className="text-sm font-semibold text-zinc-800">{TYPE_LABEL[type]}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{TYPE_DESC[type]}</p>
      </div>

      <div className="p-5 space-y-4">
        {/* 라이브 미리보기 */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">미리보기</p>
          <div
            className="flex items-center justify-center gap-2 h-[44px] px-4 rounded-xl overflow-hidden"
            style={{ background: previewBg }}
          >
            {form.enabled && form.text ? (
              <>
                {form.tag && (
                  <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold whitespace-nowrap">
                    {form.tag}
                  </span>
                )}
                <span className="text-white text-sm font-semibold truncate flex-1 min-w-0 text-center">
                  {form.text}
                </span>
                {form.hrefType === 'external' && (
                  <span className="shrink-0 text-white/70 text-xs">↗</span>
                )}
                <span className="shrink-0 flex items-center justify-center w-[44px] h-[44px] text-white/80 text-sm">
                  ✕
                </span>
              </>
            ) : (
              <span className="text-white/50 text-sm">비활성 상태 (배너 숨김)</span>
            )}
          </div>
        </div>

        {/* 편집 폼 */}
        <div className="space-y-4">
          {/* 활성화 토글 */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.enabled ? 'bg-primary' : 'bg-zinc-300'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </div>
            <span className="text-sm font-medium text-zinc-700">
              {form.enabled ? '활성 (배너 노출 중)' : '비활성 (배너 숨김)'}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* 태그 */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                태그 칩 <span className="text-zinc-400">(최대 {TAG_MAX}자)</span>
              </label>
              <div className="relative">
                <input
                  value={form.tag}
                  onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value.slice(0, TAG_MAX) }))}
                  maxLength={TAG_MAX}
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 pr-10 text-sm outline-none focus:border-zinc-500"
                  placeholder={type === 'guest' ? '가입' : '공지'}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${form.tag.length >= TAG_MAX ? 'text-red-500' : 'text-zinc-400'}`}>
                  {form.tag.length}/{TAG_MAX}
                </span>
              </div>
            </div>

            {/* 텍스트 */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                본문 텍스트 <span className="text-zinc-400">(최대 {TEXT_MAX}자 — 모바일 1줄 기준)</span>
              </label>
              <div className="relative">
                <input
                  value={form.text}
                  onChange={(e) => setForm((f) => ({ ...f, text: e.target.value.slice(0, TEXT_MAX) }))}
                  maxLength={TEXT_MAX}
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 pr-14 text-sm outline-none focus:border-zinc-500"
                  placeholder={type === 'guest' ? '지금 가입하면 혜택이 가득해요' : '새 매거진이 발행됐어요'}
                />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${form.text.length >= TEXT_MAX ? 'text-red-500' : form.text.length >= TEXT_MAX - 3 ? 'text-amber-500' : 'text-zinc-400'}`}>
                  {form.text.length}/{TEXT_MAX}
                </span>
              </div>
              {form.text.length >= TEXT_MAX && (
                <p className="mt-1 text-xs text-red-600">최대 글자 수에 도달했습니다. 모바일에서 잘릴 수 있습니다.</p>
              )}
            </div>

            {/* 링크 유형 */}
            <div className="sm:col-span-2 space-y-2">
              <p className="text-xs font-medium text-zinc-600">링크 유형</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`href-type-${type}`}
                    checked={form.hrefType === 'internal'}
                    onChange={() => handleHrefTypeChange('internal')}
                    className="accent-zinc-800"
                  />
                  <span className="text-sm text-zinc-700">내부 경로</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`href-type-${type}`}
                    checked={form.hrefType === 'external'}
                    onChange={() => handleHrefTypeChange('external')}
                    className="accent-zinc-800"
                  />
                  <span className="text-sm text-zinc-700">외부 URL</span>
                </label>
              </div>

              {form.hrefType === 'internal' ? (
                <input
                  value={form.href}
                  onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500 font-mono"
                  placeholder="/about"
                />
              ) : (
                <div className="space-y-1.5">
                  <input
                    value={form.href}
                    onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-amber-300 px-3 text-sm outline-none focus:border-amber-500 font-mono"
                    placeholder="https://forms.gle/example"
                  />
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    ⚠️ 외부 URL — 클릭 시 새 탭으로 열립니다. 정확한 주소를 입력했는지 확인하세요.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? '저장 중...' : '저장'}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">✓ 저장됐습니다. 즉시 반영됩니다.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
