'use client'

import { useState, useTransition } from 'react'
import type { Popup } from '@/generated/prisma/client'
import { togglePopupActive, deletePopup, createPopup, updatePopup } from '@/lib/actions/popups'
import type { PopupType, PopupTarget } from '@/generated/prisma/client'
import HelpTip from './HelpTip'
import { HELP } from './admin-help-texts'

const TYPE_LABELS: Record<string, string> = {
  BOTTOM_SHEET: '바텀 시트',
  FULLSCREEN: '전면',
  CENTER: '센터',
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

interface Props {
  popups: Popup[]
}

export default function PopupManager({ popups }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editingPopup, setEditingPopup] = useState<Popup | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle(id: string, isActive: boolean) {
    startTransition(() => togglePopupActive(id, !isActive))
  }

  function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return
    startTransition(() => deletePopup(id))
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
              <th className="text-left p-3 font-medium">기간</th>
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
                  {new Date(popup.startDate).toLocaleDateString('ko-KR')} ~{' '}
                  {new Date(popup.endDate).toLocaleDateString('ko-KR')}
                </td>
                <td className="p-3 text-center text-muted-foreground">
                  {popup.impressions} / {popup.clicks}
                </td>
                <td className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(popup.id, popup.isActive)}
                    disabled={isPending}
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      popup.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {popup.isActive ? '활성' : '비활성'}
                  </button>
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

function PopupForm({ popup, onDone }: { popup?: Popup; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const targetPathsRaw = fd.get('targetPaths') as string
    const targetPaths = targetPathsRaw
      ? targetPathsRaw.split(',').map((p) => p.trim()).filter(Boolean)
      : []

    const data = {
      type: fd.get('type') as PopupType,
      target: fd.get('target') as PopupTarget,
      targetPaths,
      title: (fd.get('title') as string) || null,
      content: (fd.get('content') as string) || null,
      imageUrl: (fd.get('imageUrl') as string) || null,
      linkUrl: (fd.get('linkUrl') as string) || null,
      buttonText: (fd.get('buttonText') as string) || null,
      startDate: fd.get('startDate') as string,
      endDate: fd.get('endDate') as string,
      priority: parseInt(fd.get('priority') as string) || 0,
      isActive: fd.get('isActive') === 'on',
      showOncePerDay: fd.get('showOncePerDay') === 'on',
      hideForDays: fd.get('hideForDays') ? parseInt(fd.get('hideForDays') as string) : null,
    }

    startTransition(async () => {
      if (popup) {
        await updatePopup(popup.id, data)
      } else {
        await createPopup(data)
      }
      onDone()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 mb-6 space-y-4">
      <h2 className="font-bold text-lg mb-2">{popup ? '팝업 수정' : '새 팝업 등록'}</h2>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">유형 <HelpTip text={HELP.POPUP_TYPE} /></span>
          <select name="type" defaultValue={popup?.type ?? 'CENTER'} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" required>
            <option value="CENTER">센터 팝업</option>
            <option value="BOTTOM_SHEET">바텀 시트</option>
            <option value="FULLSCREEN">전면 팝업</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">대상 페이지 <HelpTip text={HELP.POPUP_TARGET} /></span>
          <select name="target" defaultValue={popup?.target ?? 'ALL'} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" required>
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

      <label className="block">
        <span className="text-sm font-medium">커스텀 경로 (쉼표 구분) <HelpTip text={HELP.POPUP_TARGET_PATHS} /></span>
        <input name="targetPaths" defaultValue={popup?.targetPaths?.join(', ') ?? ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" placeholder="/community, /jobs/123" />
      </label>

      <label className="block">
        <span className="text-sm font-medium">제목</span>
        <input name="title" defaultValue={popup?.title ?? ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" placeholder="팝업 제목" />
      </label>

      <label className="block">
        <span className="text-sm font-medium">내용 (HTML 가능)</span>
        <textarea name="content" rows={3} defaultValue={popup?.content ?? ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" placeholder="팝업 내용..." />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">이미지 URL</span>
          <input name="imageUrl" defaultValue={popup?.imageUrl ?? ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
        </label>
        <label className="block">
          <span className="text-sm font-medium">링크 URL</span>
          <input name="linkUrl" defaultValue={popup?.linkUrl ?? ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="block">
          <span className="text-sm font-medium">버튼 텍스트</span>
          <input name="buttonText" defaultValue={popup?.buttonText ?? '확인'} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">우선순위 <HelpTip text={HELP.POPUP_PRIORITY} /></span>
          <input name="priority" type="number" defaultValue={popup?.priority ?? 0} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">N일간 안보기 <HelpTip text={HELP.POPUP_HIDE_FOR_DAYS} /></span>
          <input name="hideForDays" type="number" defaultValue={popup?.hideForDays ?? ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" placeholder="7" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">시작일</span>
          <input name="startDate" type="datetime-local" defaultValue={popup?.startDate ? new Date(popup.startDate).toISOString().slice(0, 16) : ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">종료일</span>
          <input name="endDate" type="datetime-local" defaultValue={popup?.endDate ? new Date(popup.endDate).toISOString().slice(0, 16) : ''} className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm" required />
        </label>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input name="isActive" type="checkbox" defaultChecked={popup?.isActive ?? true} className="rounded" />
          활성화 <HelpTip text={HELP.POPUP_ACTIVE} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="showOncePerDay" type="checkbox" defaultChecked={popup?.showOncePerDay ?? false} className="rounded" />
          하루 1회만 노출 <HelpTip text={HELP.POPUP_SHOW_ONCE_PER_DAY} />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-muted-foreground">
          취소
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {isPending ? '저장 중...' : popup ? '수정' : '저장'}
        </button>
      </div>
    </form>
  )
}
