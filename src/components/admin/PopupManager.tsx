'use client'

import { useState, useTransition } from 'react'
import type { Popup, PopupType, PopupTarget } from '@/generated/prisma/client'
import { togglePopupActive, deletePopup, createPopup, updatePopup } from '@/lib/actions/popups'
import { sanitizeHtml } from '@/lib/sanitize'
import HelpTip from './HelpTip'
import { HELP } from './admin-help-texts'

const TYPE_LABELS: Record<string, string> = {
  BOTTOM_SHEET: '바텀 팝업',
  FULLSCREEN: '전면',
  CENTER: '센터 카드',
}

const TARGET_LABELS: Record<string, string> = {
  ALL: '전체 페이지',
  HOME: '홈',
  COMMUNITY: '커뮤니티',
  LIFE2: '2막 준비',
  JOBS: '일자리',
  MAGAZINE: '매거진',
  CUSTOM: '커스텀 경로',
}

// 형태별 권장 이미지 규격 (어드민에 정확히 노출)
const IMAGE_SPEC: Record<string, string> = {
  CENTER: '1080 × 1080 px (1:1 정사각형)',
  FULLSCREEN: '1080 × 1920 px (9:16 세로형)',
  BOTTOM_SHEET: '1080 × 720 px (3:2 가로형)',
}

// 미리보기 이미지 비율 클래스
const PREVIEW_ASPECT: Record<string, string> = {
  CENTER: 'aspect-square',
  FULLSCREEN: 'aspect-[9/16] max-h-[260px]',
  BOTTOM_SHEET: 'aspect-[3/2]',
}

// 용도 프리셋 — 선택 시 형태 자동 세팅
const PRESETS: { key: string; label: string; type: PopupType; hint: string }[] = [
  { key: 'notice', label: '📢 공지·이벤트', type: 'CENTER', hint: '센터 카드 · 글 중심 안내' },
  { key: 'content', label: '📰 콘텐츠 홍보', type: 'CENTER', hint: '센터 카드 · 이미지+링크' },
  { key: 'promo', label: '🎉 프로모션 배너', type: 'FULLSCREEN', hint: '전면 · 이미지 중심' },
]

// KST 벽시계 ↔ datetime-local / ISO
function toKstInput(date: Date | string): string {
  const d = new Date(date)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16)
}
function kstInputToIso(v: string): string {
  return v ? `${v}:00+09:00` : ''
}

function getPopupStatus(popup: Popup): 'LIVE' | 'PENDING' | 'EXPIRED' | 'INACTIVE' {
  if (!popup.isActive) return 'INACTIVE'
  const now = new Date()
  if (new Date(popup.startDate) > now) return 'PENDING'
  if (new Date(popup.endDate) < now) return 'EXPIRED'
  return 'LIVE'
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  LIVE:     { label: '노출중',  cls: 'bg-green-100 text-green-700' },
  PENDING:  { label: '대기중',  cls: 'bg-blue-100 text-blue-700' },
  EXPIRED:  { label: '만료됨',  cls: 'bg-orange-100 text-orange-700' },
  INACTIVE: { label: '비활성', cls: 'bg-gray-100 text-gray-500' },
}

interface Props {
  popups: Popup[]
}

export default function PopupManager({ popups }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editingPopup, setEditingPopup] = useState<Popup | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      try {
        await togglePopupActive(id, !isActive)
      } catch (err) {
        alert(err instanceof Error ? err.message : '상태 변경에 실패했습니다.')
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('이 팝업을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return
    startTransition(async () => {
      try {
        await deletePopup(id)
      } catch (err) {
        alert(err instanceof Error ? err.message : '삭제에 실패했습니다.')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">팝업 관리</h1>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm)
            setEditingPopup(null)
          }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
        >
          {showForm ? '취소' : '+ 새 팝업'}
        </button>
      </div>

      {showForm && <PopupForm onDone={() => setShowForm(false)} />}
      {editingPopup && (
        <PopupForm popup={editingPopup} onDone={() => setEditingPopup(null)} />
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3 font-medium">제목</th>
              <th className="text-left p-3 font-medium">유형</th>
              <th className="text-left p-3 font-medium">대상</th>
              <th className="text-left p-3 font-medium">기간 (KST)</th>
              <th className="text-center p-3 font-medium">노출/클릭</th>
              <th className="text-center p-3 font-medium">상태</th>
              <th className="text-center p-3 font-medium">액션</th>
            </tr>
          </thead>
          <tbody>
            {popups.map((popup) => (
              <tr key={popup.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="p-3 font-medium">{popup.title ?? '(제목 없음)'}</td>
                <td className="p-3 text-muted-foreground">{TYPE_LABELS[popup.type] ?? popup.type}</td>
                <td className="p-3 text-muted-foreground">{TARGET_LABELS[popup.target] ?? popup.target}</td>
                <td className="p-3 text-muted-foreground text-xs">
                  <div className="whitespace-nowrap">
                    {new Date(popup.startDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="whitespace-nowrap text-zinc-400">
                    ~ {new Date(popup.endDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </td>
                <td className="p-3 text-center text-muted-foreground">
                  {popup.impressions} / {popup.clicks}
                </td>
                <td className="p-3 text-center">
                  {(() => {
                    const st = getPopupStatus(popup)
                    const { label, cls } = STATUS_MAP[st]
                    return (
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
                          {label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggle(popup.id, popup.isActive)}
                          disabled={isPending}
                          className="text-xs text-zinc-400 hover:text-zinc-700 underline disabled:opacity-40"
                        >
                          {popup.isActive ? '끄기' : '켜기'}
                        </button>
                      </div>
                    )
                  })()}
                </td>
                <td className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPopup(popup)
                      setShowForm(false)
                    }}
                    disabled={isPending}
                    className="text-blue-500 text-sm hover:underline mr-2"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(popup.id)}
                    disabled={isPending}
                    className="text-red-500 text-sm hover:underline"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {popups.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  등록된 팝업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── 팝업 생성/수정 폼 ── */

interface FormState {
  type: PopupType
  target: PopupTarget
  targetPaths: string
  title: string
  content: string
  imageUrl: string
  linkUrl: string
  buttonText: string
  startDate: string
  endDate: string
  priority: number
  isActive: boolean
  showOncePerDay: boolean
  hideForDays: string
}

function PopupForm({ popup, onDone }: { popup?: Popup; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<FormState>({
    type: popup?.type ?? 'CENTER',
    target: popup?.target ?? 'ALL',
    targetPaths: popup?.targetPaths?.join(', ') ?? '',
    title: popup?.title ?? '',
    content: popup?.content ?? '',
    imageUrl: popup?.imageUrl ?? '',
    linkUrl: popup?.linkUrl ?? '',
    buttonText: popup?.buttonText ?? '확인',
    startDate: popup?.startDate ? toKstInput(popup.startDate) : '',
    endDate: popup?.endDate ? toKstInput(popup.endDate) : '',
    priority: popup?.priority ?? 0,
    isActive: popup?.isActive ?? true,
    showOncePerDay: popup?.showOncePerDay ?? false,
    hideForDays: popup?.hideForDays != null ? String(popup.hideForDays) : '',
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
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
      set('imageUrl', publicUrl)
    } catch {
      alert('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  function handleSave() {
    if (!form.startDate || !form.endDate) {
      alert('시작일과 종료일을 입력하세요.')
      return
    }
    const data = {
      type: form.type,
      target: form.target,
      targetPaths: form.targetPaths.split(',').map((p) => p.trim()).filter(Boolean),
      title: form.title || null,
      content: form.content || null,
      imageUrl: form.imageUrl || null,
      linkUrl: form.linkUrl || null,
      buttonText: form.buttonText || null,
      startDate: kstInputToIso(form.startDate),
      endDate: kstInputToIso(form.endDate),
      priority: form.priority,
      isActive: form.isActive,
      showOncePerDay: form.showOncePerDay,
      hideForDays: form.hideForDays ? parseInt(form.hideForDays, 10) : null,
    }
    startTransition(async () => {
      try {
        if (popup) {
          await updatePopup(popup.id, data)
        } else {
          await createPopup(data)
        }
        onDone()
      } catch (err) {
        alert(err instanceof Error ? err.message : '저장에 실패했습니다. 다시 시도해주세요.')
      }
    })
  }

  const inputCls = 'mt-1 block w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500'

  return (
    <div className="bg-white rounded-xl border p-6 mb-6 space-y-5">
      <h2 className="font-bold text-lg">{popup ? '팝업 수정' : '새 팝업 등록'}</h2>

      {/* 운영 가이드 (신입 담당자 필독) */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 space-y-1.5">
        <p className="font-semibold">📋 팝업 운영 가이드 (담당자 필독)</p>
        <ul className="space-y-1 list-none pl-0 text-blue-700">
          <li>• <strong>용도를 먼저 고르면</strong> 알맞은 형태가 자동 설정됩니다. 그 다음 내용만 채우면 돼요.</li>
          <li>• <strong>형태 3가지</strong>: 센터 카드(중앙 작은 팝업·가장 무난) / 바텀 팝업(하단에서 올라옴) / 전면(화면 전체·이벤트용). 셋 다 큰 X(닫기) 버튼이 있어요.</li>
          <li>• <strong>이미지</strong>: 파일 선택하면 자동 업로드. 형태별 권장 크기가 아래에 표시됩니다(안 맞으면 잘릴 수 있어요).</li>
          <li>• <strong>기간은 한국 시간(KST)</strong> 기준. 활성화가 켜져 있고 기간 안일 때만 노출됩니다.</li>
          <li>• <strong>너무 자주 띄우면 거슬려요</strong> → "하루 1회만 노출" 또는 "N일간 안보기"로 빈도를 조절하세요(권장).</li>
          <li>• 아래 <strong>미리보기</strong>로 실제 모양을 확인하며 만드세요. 각 항목의 <strong>?</strong>에 마우스를 올리면 설명이 나옵니다.</li>
        </ul>
      </div>

      {/* 용도 프리셋 */}
      <div>
        <p className="text-sm font-medium text-zinc-700 mb-2">용도 선택 (형태 자동 설정)</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => set('type', p.type)}
              className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                form.type === p.type ? 'border-primary bg-primary/5' : 'border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="font-medium text-zinc-800">{p.label}</div>
              <div className="text-xs text-zinc-500">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">유형 <HelpTip text={HELP.POPUP_TYPE} /></span>
          <select value={form.type} onChange={(e) => set('type', e.target.value as PopupType)} className={inputCls} required>
            <option value="CENTER">센터 카드</option>
            <option value="BOTTOM_SHEET">바텀 팝업</option>
            <option value="FULLSCREEN">전면 팝업</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">대상 페이지 <HelpTip text={HELP.POPUP_TARGET} /></span>
          <select value={form.target} onChange={(e) => set('target', e.target.value as PopupTarget)} className={inputCls} required>
            <option value="ALL">전체 페이지</option>
            <option value="HOME">홈</option>
            <option value="COMMUNITY">커뮤니티</option>
            <option value="LIFE2">2막 준비</option>
            <option value="JOBS">일자리</option>
            <option value="MAGAZINE">매거진</option>
            <option value="CUSTOM">커스텀 경로</option>
          </select>
        </label>
      </div>

      {form.target === 'CUSTOM' && (
        <label className="block">
          <span className="text-sm font-medium">커스텀 경로 (쉼표 구분) <HelpTip text={HELP.POPUP_TARGET_PATHS} /></span>
          <input value={form.targetPaths} onChange={(e) => set('targetPaths', e.target.value)} className={`${inputCls} font-mono`} placeholder="/community, /jobs/123" />
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium">제목 <HelpTip text={HELP.POPUP_TITLE} /></span>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="팝업 제목" />
      </label>

      <label className="block">
        <span className="text-sm font-medium">내용 <HelpTip text={HELP.POPUP_CONTENT} /></span>
        <textarea value={form.content} onChange={(e) => set('content', e.target.value)} rows={3} className={inputCls} placeholder="팝업 본문 (간단한 HTML 가능)" />
      </label>

      {/* 이미지 — 파일 업로드 + 규격 명시 */}
      <div>
        <span className="text-sm font-medium">이미지 <HelpTip text={HELP.POPUP_IMAGE} /></span>
        <div className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
          <p className="text-xs text-zinc-600">
            권장 크기: <strong className="text-zinc-800">{IMAGE_SPEC[form.type]}</strong> · JPG·PNG·WebP · 4MB 이하
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }}
            className="block text-sm"
          />
          {uploading && <p className="text-xs text-zinc-500">업로드 중…</p>}
          <input value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} className={`${inputCls} font-mono`} placeholder="또는 이미지 URL 직접 입력" />
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium">링크 URL <HelpTip text={HELP.POPUP_LINK} /></span>
        <input value={form.linkUrl} onChange={(e) => set('linkUrl', e.target.value)} className={inputCls} placeholder="https://... (비우면 닫기만)" />
      </label>

      <div className="grid grid-cols-3 gap-4">
        <label className="block">
          <span className="text-sm font-medium">버튼 텍스트 <HelpTip text={HELP.POPUP_BUTTON} /></span>
          <input value={form.buttonText} onChange={(e) => set('buttonText', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">우선순위 <HelpTip text={HELP.POPUP_PRIORITY} /></span>
          <input type="number" value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">N일간 안보기 <HelpTip text={HELP.POPUP_HIDE_FOR_DAYS} /></span>
          <input type="number" value={form.hideForDays} onChange={(e) => set('hideForDays', e.target.value)} className={inputCls} placeholder="7" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">시작일 <span className="text-xs text-zinc-400">(KST)</span> <HelpTip text={HELP.POPUP_PERIOD} /></span>
          <input type="datetime-local" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">종료일 <span className="text-xs text-zinc-400">(KST)</span></span>
          <input type="datetime-local" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} required />
        </label>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="rounded" />
          활성화 <HelpTip text={HELP.POPUP_ACTIVE} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.showOncePerDay} onChange={(e) => set('showOncePerDay', e.target.checked)} className="rounded" />
          하루 1회만 노출 <HelpTip text={HELP.POPUP_SHOW_ONCE_PER_DAY} />
        </label>
      </div>

      {/* 실시간 미리보기 */}
      <PreviewBox form={form} />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-muted-foreground">
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || uploading}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {isPending ? '저장 중...' : popup ? '수정' : '저장'}
        </button>
      </div>
    </div>
  )
}

/* ── 실시간 미리보기 (형태별 모양) ── */

function PreviewBox({ form }: { form: FormState }) {
  return (
    <div className="border-t border-zinc-100 pt-4">
      <p className="text-sm font-medium text-zinc-700 mb-2">
        미리보기 <span className="text-xs text-zinc-400">— {TYPE_LABELS[form.type]} ({IMAGE_SPEC[form.type]})</span>
      </p>
      <div className={`bg-zinc-200 rounded-xl p-6 flex ${form.type === 'BOTTOM_SHEET' ? 'items-end' : form.type === 'FULLSCREEN' ? 'items-stretch' : 'items-center'} justify-center min-h-[260px]`}>
        <div
          className={`relative bg-white shadow-lg overflow-hidden w-full ${
            form.type === 'CENTER' ? 'max-w-[300px] rounded-2xl' : form.type === 'BOTTOM_SHEET' ? 'max-w-[420px] rounded-t-2xl' : 'max-w-[240px] rounded-2xl'
          }`}
        >
          {/* X 버튼 */}
          <span className="absolute top-2 right-2 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white text-sm">✕</span>

          {form.type === 'BOTTOM_SHEET' && (
            <div className="flex justify-center pt-2 pb-1"><span className="h-1.5 w-10 rounded-full bg-zinc-300" /></div>
          )}

          {form.title && <div className="px-4 pt-3 pr-12 font-bold text-zinc-900 text-sm">{form.title}</div>}

          <div className="px-4 py-3">
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="미리보기" className={`w-full rounded-lg object-cover ${PREVIEW_ASPECT[form.type]}`} />
            ) : (
              <div className={`w-full rounded-lg bg-zinc-100 flex items-center justify-center text-xs text-zinc-400 ${PREVIEW_ASPECT[form.type]}`}>
                이미지 영역 ({IMAGE_SPEC[form.type]})
              </div>
            )}
            {form.content && (
              <div className="mt-2 text-xs text-zinc-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.content) }} />
            )}
          </div>

          <div className="px-4 pb-4">
            <div className="w-full text-center bg-primary text-white rounded-lg py-2 text-sm font-bold">{form.buttonText || '확인'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
