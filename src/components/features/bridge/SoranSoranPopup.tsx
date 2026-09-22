'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 소란소란 안내 모달.
 *
 * 🔴 **읽기 화면에서는 뜨지 않는다.** 검색으로 글 하나 보러 온 사람에게 2초 만에 모달을 씌우면
 *    읽기를 끊어 그대로 이탈한다. 그 동선은 글 하단 인라인 카드(`SoranSoranPostCard`)가 맡는다.
 *    여기서는 홈·목록처럼 **둘러보는 화면**에서만 뜬다.
 *
 * SEO: `ssr:false` 로만 마운트한다(크롤러 노출 시 doorway 판정 위험).
 */

const HIDE_KEY = 'unao_bridge_popup_hide_until'
/** 어드민 팝업이 떠 있으면 양보 — PushPermissionToast 와 같은 키를 공유한다. */
const ADMIN_POPUP_KEY = 'unao_admin_popup_visible'
const SHOW_DELAY_MS = 2500
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 읽기 화면(상세) 판정. 목록은 세그먼트 2개, 상세는 3개다.
 *   /community/free       → 목록 (팝업 O)
 *   /community/free/abc   → 상세 (팝업 X)
 *   /magazine/slug        → 상세 (팝업 X)
 */
export function isReadingPage(pathname: string): boolean {
  const seg = pathname.split('/').filter(Boolean)
  if (seg.length === 0) return false
  const [root] = seg
  if (root === 'community') return seg.length >= 3
  if (root === 'magazine' || root === 'jobs' || root === 'guide' || root === 'topic') {
    return seg.length >= 2
  }
  return false
}

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
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [shown, setShown] = useState(false) // 진입 트랜지션용

  useEffect(() => {
    if (isReadingPage(pathname)) return
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
      window.requestAnimationFrame(() => setShown(true))
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [pathname])

  useEffect(() => {
    if (!visible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [visible])

  function close(days: number) {
    hideFor(days)
    try {
      sessionStorage.removeItem(ADMIN_POPUP_KEY)
    } catch {
      /* noop */
    }
    setShown(false)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className={cn(
        // z-[200]: 어드민 팝업(PopupRenderer)과 같은 층. FAB(z-[97]) 위여야 버튼이 가려지지 않는다.
        'fixed inset-0 z-[200] flex items-end justify-center px-4 pb-6 transition-opacity duration-200 sm:items-center sm:pb-0',
        shown ? 'bg-black/60 opacity-100' : 'bg-black/0 opacity-0',
      )}
      onClick={() => close(1)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bridge-popup-title"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-sm overflow-hidden rounded-3xl bg-card shadow-2xl transition-all duration-300',
          shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        )}
      >
        {/* 헤더 — 브랜드 그라디언트. 시선을 먼저 잡는다 */}
        <div
          className="flex flex-col items-center gap-2 px-6 py-7 text-center"
          style={{
            background:
              'linear-gradient(135deg, var(--gradient-hot-from) 0%, var(--gradient-hot-to) 100%)',
          }}
        >
          <span className="text-4xl leading-none" aria-hidden="true">
            💬
          </span>
          <p className="m-0 text-caption font-semibold tracking-wide text-white/90">새 커뮤니티</p>
          <p id="bridge-popup-title" className="m-0 text-2xl font-bold leading-tight text-white break-keep">
            {BRIDGE_COPY.name}
          </p>
        </div>

        <div className="px-6 pb-6 pt-5">
          <p className="m-0 text-center text-body leading-relaxed text-foreground break-keep">
            {BRIDGE_COPY.bodyKnown}
            <br />
            {BRIDGE_COPY.bodySub}
          </p>

          {/* 핵심 한 줄 — 강조 박스로 분리해 눈에 걸리게 */}
          <div
            className="mt-4 rounded-2xl px-4 py-3 text-center"
            style={{ background: 'var(--surface-coral-pale)' }}
          >
            <p className="m-0 text-body font-bold text-primary-text break-keep">{BRIDGE_COPY.hook}</p>
          </div>

          <a
            href={bridgeUrl('popup')}
            target="_blank"
            rel="noopener"
            onClick={() => close(7)}
            className={cn(buttonVariants({ variant: 'default', size: 'default' }), 'mt-5 w-full no-underline')}
          >
            {BRIDGE_COPY.cta} →
          </a>

          <p className="mt-4 text-center text-caption text-muted-foreground break-keep">
            {BRIDGE_COPY.reassure}
          </p>

          <div className="mt-1 flex items-center justify-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => close(1)}>
              닫기
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => close(7)}>
              7일간 보지 않기
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
