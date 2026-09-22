'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 소란소란 안내 모달 (전 경로).
 *
 * 어드민 팝업(`PopupRenderer`)이 아니라 **코드로 고정**한 팝업이다.
 * 어드민 계정 없이도 집행되어야 해서 이렇게 뒀다 — 문구를 바꾸려면 배포가 필요하다.
 * 나중에 어드민 운영으로 옮기려면 이 컴포넌트를 떼고 Popup 레코드를 등록하면 된다.
 *
 * SEO: `ssr: false` 로만 마운트한다(크롤러에 노출되면 doorway 판정 위험).
 */

const HIDE_KEY = 'unao_bridge_popup_hide_until'
/** 어드민 팝업이 떠 있으면 양보 — PushPermissionToast 와 같은 키를 공유한다. */
const ADMIN_POPUP_KEY = 'unao_admin_popup_visible'
const SHOW_DELAY_MS = 2000
const DAY_MS = 24 * 60 * 60 * 1000

function isHidden(): boolean {
  try {
    const raw = localStorage.getItem(HIDE_KEY)
    return !!raw && Date.now() < Number(raw)
  } catch {
    return false
  }
}

function hideFor(days: number) {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now() + days * DAY_MS))
  } catch {
    /* 사파리 프라이빗 등 — 저장 실패해도 닫기는 동작한다 */
  }
}

export default function SoranSoranPopup() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isHidden()) return
    const t = window.setTimeout(() => {
      // 어드민 팝업이 이미 떠 있으면 이번 세션은 양보한다(모달 2겹 방지)
      try {
        if (sessionStorage.getItem(ADMIN_POPUP_KEY) === '1') return
        sessionStorage.setItem(ADMIN_POPUP_KEY, '1')
      } catch {
        /* noop */
      }
      setVisible(true)
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!visible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible])

  function close(days: number) {
    hideFor(days)
    try {
      sessionStorage.removeItem(ADMIN_POPUP_KEY)
    } catch {
      /* noop */
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
      onClick={() => close(1)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bridge-popup-title"
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="bridge-popup-title" className="text-title font-bold text-foreground break-keep m-0">
          {BRIDGE_COPY.title}
        </p>

        <div className="mt-3 space-y-1">
          <p className="text-body text-muted-foreground break-keep m-0">{BRIDGE_COPY.bodyKnown}</p>
          <p className="text-body text-muted-foreground break-keep m-0">{BRIDGE_COPY.bodySub}</p>
        </div>

        <p className="mt-3 text-body font-bold text-primary break-keep m-0">{BRIDGE_COPY.hook}</p>

        <a
          href={bridgeUrl('popup')}
          target="_blank"
          rel="noopener"
          onClick={() => close(7)}
          className="mt-5 flex min-h-control w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-center text-body font-bold leading-tight text-white no-underline break-keep transition-opacity hover:opacity-90"
        >
          {BRIDGE_COPY.cta}
        </a>

        <p className="mt-3 text-center text-caption text-muted-foreground break-keep m-0">
          {BRIDGE_COPY.reassure}
        </p>

        <div className="mt-2 flex items-center justify-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => close(1)}>
            닫기
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => close(7)}>
            7일간 보지 않기
          </Button>
        </div>
      </div>
    </div>
  )
}
