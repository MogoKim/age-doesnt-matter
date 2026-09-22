'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 소란소란 안내 모달.
 *
 * 🔴 **공격적 모드 (창업자 결정 2026-09-22)**
 *   - 전 경로에서 뜬다. **읽기 화면(글 상세)도 예외 없다** — SEO 유입 방해를 감수한다.
 *   - **닫아도 저장하지 않는다.** 페이지를 옮길 때마다 다시 뜬다.
 *   - **X 버튼을 제외한 카드 전체가 소란소란 링크다.**
 *   판단 근거: 우나어는 사실상 종료 상태이고, 남은 트래픽을 최대한 넘기는 것이 목적이다.
 *
 * ⚠️ 구글 모바일 인터스티셜 페널티 위험이 있다. `ssr:false` 라도 Googlebot 은 JS 를 렌더링하므로
 *    "크롤러가 못 본다"는 보장은 없다. 이 위험을 알고도 선택한 배치다.
 *    단 `sitemap`·`robots`·`canonical` 은 건드리지 않는다(CI seo-guard 준수).
 */

const SHOW_DELAY_MS = 1500
/** 어드민 팝업이 떠 있으면 양보 — PushPermissionToast 와 같은 키를 공유한다. */
const ADMIN_POPUP_KEY = 'unao_admin_popup_visible'

export default function SoranSoranPopup() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [shown, setShown] = useState(false) // 진입 트랜지션용

  // 경로가 바뀔 때마다 처음부터 다시 — 닫은 기록을 남기지 않는다(의도).
  // 리셋은 cleanup 에서 한다: effect 본문의 동기 setState 는 cascading render 를 만든다.
  useEffect(() => {
    // 🔴 자동화 브라우저(E2E)에서는 띄우지 않는다.
    //    이 팝업은 경로가 바뀔 때마다 다시 뜨므로, 오버레이가 pointer events 를 가로채
    //    SPA 네비게이션 이후의 클릭을 전부 막는다(2026-09-22 main E2E Smoke 실패 원인).
    //    실제 사용자에게는 영향이 없다 — navigator.webdriver 는 자동화에서만 true 다.
    if (typeof navigator !== 'undefined' && navigator.webdriver) return

    const t = window.setTimeout(() => {
      try {
        // 어드민 팝업이 이미 떠 있으면 이번에는 양보한다(모달 2겹 방지)
        if (sessionStorage.getItem(ADMIN_POPUP_KEY) === '1') return
        sessionStorage.setItem(ADMIN_POPUP_KEY, '1')
      } catch {
        /* noop */
      }
      setVisible(true)
      window.requestAnimationFrame(() => setShown(true))
    }, SHOW_DELAY_MS)

    return () => {
      window.clearTimeout(t)
      setVisible(false)
      setShown(false)
    }
  }, [pathname])

  useEffect(() => {
    if (!visible) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [visible])

  function close() {
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
        'fixed inset-0 z-[200] flex items-end justify-center px-4 pb-6 transition-opacity duration-200 sm:items-center sm:pb-0',
        shown ? 'bg-black/60 opacity-100' : 'bg-black/0 opacity-0',
      )}
      onClick={close}
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
        {/* 🔴 X 버튼을 뺀 카드 전체가 소란소란 링크다(창업자 결정). */}
        <a
          href={bridgeUrl('popup')}
          target="_blank"
          rel="noopener"
          onClick={close}
          className="block no-underline"
        >
          {/* 헤더 — 브랜드 그라디언트 */}
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
            <p
              id="bridge-popup-title"
              className="m-0 text-2xl font-bold leading-tight text-white break-keep"
            >
              {BRIDGE_COPY.name}
            </p>
          </div>

          <div className="px-6 pb-5 pt-5 text-center">
            <p className="m-0 text-body leading-relaxed text-foreground break-keep">
              {BRIDGE_COPY.bodyKnown}
              <br />
              {BRIDGE_COPY.bodySub}
            </p>

            {/* 핵심 한 줄 — 강조 박스로 분리해 눈에 걸리게 */}
            <div
              className="mt-4 rounded-2xl px-4 py-3"
              style={{ background: 'var(--surface-coral-pale)' }}
            >
              <p className="m-0 text-body font-bold text-primary-text break-keep">
                {BRIDGE_COPY.hook}
              </p>
            </div>

            {/* CTA — 링크는 바깥 <a> 가 담당한다(중첩 금지). 모양만 버튼. */}
            <div className="mt-5 flex min-h-control w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2 text-center text-body font-bold leading-tight text-primary-foreground break-keep">
              {BRIDGE_COPY.cta} →
            </div>
          </div>
        </a>

        {/* 하단 — 닫기 X 하나만, 가운데 */}
        <div className="flex justify-center border-t border-border">
          <IconButton type="button" variant="ghost" label="닫기" onClick={close}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  )
}
