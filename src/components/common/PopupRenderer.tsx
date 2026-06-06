'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/lib/sanitize'

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

  if (!activePopup) return null

  const props = {
    popup: activePopup,
    onClose: handleClose,
    onHide: handleHideForDays,
    onClick: handleClick,
  }

  return (
    <>
      {activePopup.type === 'FULLSCREEN' && <FullscreenPopup {...props} />}
      {activePopup.type === 'CENTER' && <CenterPopup {...props} />}
      {activePopup.type === 'BOTTOM_SHEET' && <BottomSheetPopup {...props} />}
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

/* ── 닫기 버튼 (공통, 시니어 가독성: 52px 원형 + 명확 대비) ── */

function CloseButton({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="닫기"
      className={cn(
        'flex items-center justify-center w-[52px] h-[52px] rounded-full bg-black/50 text-white shadow-md hover:bg-black/70 transition-colors [-webkit-tap-highlight-color:transparent]',
        className,
      )}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M6 6l10 10M16 6L6 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/* ── 전면 팝업 (9:16 이미지 중심) ── */

function FullscreenPopup({ popup, onClose, onHide, onClick }: PopupProps) {
  return (
    <div className="fixed inset-0 z-[200] bg-card flex flex-col" role="dialog" aria-modal="true" aria-label={popup.title ?? '팝업'}>
      <div className="absolute top-4 right-4 z-10">
        <CloseButton onClose={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-20 pb-4">
        {popup.title && <h2 className="text-heading font-bold text-foreground mb-4 text-center">{popup.title}</h2>}
        <PopupBody popup={popup} onClick={onClick} imageAspect="aspect-[9/16] max-h-[70vh]" />
      </div>

      <PopupFooter popup={popup} onClose={onClose} onHide={onHide} />
    </div>
  )
}

/* ── 센터 팝업 (1:1 이미지) ── */

function CenterPopup({ popup, onClose, onHide, onClick }: PopupProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={popup.title ?? '팝업'}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl max-w-[400px] w-full max-h-[85vh] overflow-y-auto shadow-xl animate-in zoom-in-95 duration-200">
        <div className="absolute top-2 right-2 z-10">
          <CloseButton onClose={onClose} />
        </div>

        {popup.title && (
          <div className="p-5 pb-2 pr-16">
            <h2 className="text-title font-bold text-foreground">{popup.title}</h2>
          </div>
        )}

        <PopupBody popup={popup} onClick={onClick} imageAspect="aspect-square" />

        <PopupFooter popup={popup} onClose={onClose} onHide={onHide} />
      </div>
    </div>
  )
}

/* ── 바텀 팝업 (하단 시트, 3:2 이미지) ── */

function BottomSheetPopup({ popup, onClose, onHide, onClick }: PopupProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={popup.title ?? '팝업'}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-t-2xl w-full max-w-[600px] max-h-[85vh] overflow-y-auto shadow-xl animate-in slide-in-from-bottom duration-300">
        <div className="absolute top-2 right-2 z-10">
          <CloseButton onClose={onClose} />
        </div>

        {/* 시트 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-zinc-300" />
        </div>

        {popup.title && (
          <div className="px-5 pt-2 pb-1 pr-16">
            <h2 className="text-title font-bold text-foreground">{popup.title}</h2>
          </div>
        )}

        <PopupBody popup={popup} onClick={onClick} imageAspect="aspect-[3/2]" />

        <PopupFooter popup={popup} onClose={onClose} onHide={onHide} />
      </div>
    </div>
  )
}

/* ── 팝업 본문 (공통) — imageAspect로 형태별 비율 ── */

function PopupBody({ popup, onClick, imageAspect = 'aspect-[4/3]' }: { popup: PopupData; onClick: () => void; imageAspect?: string }) {
  const isClickable = !!popup.linkUrl

  return (
    <div
      className={cn('px-4 py-3', isClickable && 'cursor-pointer')}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {popup.imageUrl && (
        <div className={cn('relative w-full rounded-xl overflow-hidden mb-4', imageAspect)}>
          <Image
            src={popup.imageUrl}
            alt={popup.title ?? '팝업 이미지'}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
          />
        </div>
      )}
      {popup.content && (
        <div
          className="text-body text-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(popup.content) }}
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
    <div className="p-4 flex items-center justify-between border-t border-border bg-card sticky bottom-0">
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
