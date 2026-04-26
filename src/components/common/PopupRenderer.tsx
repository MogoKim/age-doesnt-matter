'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface PopupData {
  id: string
  type: 'BOTTOM_SHEET' | 'FULLSCREEN' | 'CENTER'
  title: string | null
  content: string | null
  imageUrl: string | null
  linkUrl: string | null
  buttonText: string | null
  showOncePerDay: boolean
  hideForDays: number | null
  priority: number
}

const LS_PREFIX = 'unao-popup-hide-'

function getHideKey(popupId: string): string {
  return `${LS_PREFIX}${popupId}`
}

function isPopupHidden(popup: PopupData): boolean {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(getHideKey(popup.id))
  if (!raw) return false

  const hideUntil = parseInt(raw, 10)
  if (isNaN(hideUntil)) return false
  return Date.now() < hideUntil
}

function hidePopup(popup: PopupData): void {
  let hideUntilMs: number

  if (popup.hideForDays && popup.hideForDays > 0) {
    hideUntilMs = Date.now() + popup.hideForDays * 24 * 60 * 60 * 1000
  } else if (popup.showOncePerDay) {
    // 오늘 23:59:59까지
    const tomorrow = new Date()
    tomorrow.setHours(23, 59, 59, 999)
    hideUntilMs = tomorrow.getTime()
  } else {
    // 세션 동안만 숨기기 — sessionStorage 대체로 1시간
    hideUntilMs = Date.now() + 60 * 60 * 1000
  }

  localStorage.setItem(getHideKey(popup.id), String(hideUntilMs))
}

export default function PopupRenderer() {
  const pathname = usePathname()
  const [popups, setPopups] = useState<PopupData[]>([])
  const [activePopup, setActivePopup] = useState<PopupData | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/popups?path=${encodeURIComponent(pathname)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data: { popups: PopupData[] }) => {
        const visible = data.popups.filter((p) => !isPopupHidden(p))
        setPopups(visible)
        if (visible.length > 0) {
          setActivePopup(visible[0])
        }
      })
      .catch(() => {
        // 네트워크 에러 무시
      })

    return () => controller.abort()
  }, [pathname])

  const handleClose = useCallback(() => {
    if (!activePopup) return
    hidePopup(activePopup)

    // 다음 팝업 표시
    const remaining = popups.filter((p) => p.id !== activePopup.id)
    setPopups(remaining)
    setActivePopup(remaining.length > 0 ? remaining[0] : null)
  }, [activePopup, popups])

  const handleHideForDays = useCallback(() => {
    if (!activePopup) return
    // hideForDays 값이 있으면 그대로, 없으면 showOncePerDay로 처리
    hidePopup(activePopup)

    const remaining = popups.filter((p) => p.id !== activePopup.id)
    setPopups(remaining)
    setActivePopup(remaining.length > 0 ? remaining[0] : null)
  }, [activePopup, popups])

  const handleClick = useCallback(() => {
    if (!activePopup?.linkUrl) return

    // 클릭 이벤트 기록
    fetch('/api/popups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popupId: activePopup.id, event: 'click' }),
    }).catch(() => {})

    window.open(activePopup.linkUrl, '_blank', 'noopener')
    handleClose()
  }, [activePopup, handleClose])

  // 노출 기록
  useEffect(() => {
    if (!activePopup) return
    fetch('/api/popups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popupId: activePopup.id, event: 'impression' }),
    }).catch(() => {})
  }, [activePopup])

  // TODO: 팝업 내용 수정 후 false로 변경
  const POPUP_DISABLED = true
  if (POPUP_DISABLED || !activePopup) return null

  return (
    <>
      {/* BOTTOM_SHEET 비활성화 — 광고 팝업 UX 문제로 제거. 공지는 CENTER 타입 사용 */}
      {activePopup.type === 'FULLSCREEN' && (
        <FullscreenPopup
          popup={activePopup}
          onClose={handleClose}
          onHide={handleHideForDays}
          onClick={handleClick}
        />
      )}
      {activePopup.type === 'CENTER' && (
        <CenterPopup
          popup={activePopup}
          onClose={handleClose}
          onHide={handleHideForDays}
          onClick={handleClick}
        />
      )}
    </>
  )
}

/* ── 공통 Props ── */

interface PopupProps {
  popup: PopupData
  onClose: () => void
  onHide: () => void
  onClick: () => void
}

/* ── 전면 팝업 ── */

function FullscreenPopup({ popup, onClose, onHide, onClick }: PopupProps) {
  return (
    <div className="fixed inset-0 z-[200] bg-card flex flex-col" role="dialog" aria-modal="true" aria-label={popup.title ?? '팝업'}>
      <div className="flex items-center justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-[52px] h-[52px] text-muted-foreground text-xl"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {popup.title && <h2 className="text-heading font-bold text-foreground mb-4 text-center">{popup.title}</h2>}
        <PopupBody popup={popup} onClick={onClick} />
      </div>

      <PopupFooter popup={popup} onClose={onClose} onHide={onHide} />
    </div>
  )
}

/* ── 센터 팝업 ── */

function CenterPopup({ popup, onClose, onHide, onClick }: PopupProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={popup.title ?? '팝업'}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl max-w-[400px] w-full max-h-[80vh] overflow-y-auto shadow-xl animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 flex items-center justify-center w-[44px] h-[44px] text-muted-foreground text-lg z-10"
          aria-label="닫기"
        >
          ✕
        </button>

        {popup.title && (
          <div className="p-5 pb-2">
            <h2 className="text-title font-bold text-foreground pr-8">{popup.title}</h2>
          </div>
        )}

        <PopupBody popup={popup} onClick={onClick} />

        <PopupFooter popup={popup} onClose={onClose} onHide={onHide} />
      </div>
    </div>
  )
}

/* ── 팝업 본문 (공통) ── */

function PopupBody({ popup, onClick }: { popup: PopupData; onClick: () => void }) {
  const isClickable = !!popup.linkUrl

  return (
    <div
      className={cn('px-4 py-3', isClickable && 'cursor-pointer')}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {popup.imageUrl && (
        <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-4">
          <Image
            src={popup.imageUrl}
            alt={popup.title ?? '팝업 이미지'}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 400px"
          />
        </div>
      )}
      {popup.content && (
        <div
          className="text-body text-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: popup.content }}
        />
      )}
    </div>
  )
}

/* ── 팝업 하단 버튼 (공통) ── */

function PopupFooter({ popup, onClose, onHide }: { popup: PopupData; onClose: () => void; onHide: () => void }) {
  const hideLabel = popup.hideForDays
    ? `${popup.hideForDays}일간 보지 않기`
    : popup.showOncePerDay
      ? '오늘 하루 안보기'
      : null

  return (
    <div className="p-4 flex items-center justify-between border-t border-border">
      {hideLabel ? (
        <button
          type="button"
          onClick={onHide}
          className="text-caption text-muted-foreground min-h-[52px] px-2"
        >
          {hideLabel}
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onClose}
        className="min-h-[52px] px-6 bg-primary text-white rounded-xl font-bold text-body transition-colors hover:bg-primary/90"
      >
        {popup.buttonText ?? '확인'}
      </button>
    </div>
  )
}
