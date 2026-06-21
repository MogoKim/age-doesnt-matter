'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { canAskPushPermission, recordDenied, recordGranted } from '@/lib/push/permission'
import { subscribeToPush } from '@/lib/push/subscribe'
import { flags } from '@/lib/feature-flags'
import { trackEvent } from '@/lib/track'

type TriggerType = 'comment' | 'job' | 'signup' | 'post' | 'visit'

const TRIGGER_KEY = 'push_toast_trigger'
const POPUP_VISIBLE_KEY = 'pwa_shown_this_session'      // AddToHomeScreen(PWA 설치팝업) 표시중
const ADMIN_POPUP_KEY = 'unao_admin_popup_visible'     // PopupRenderer(어드민 공지팝업) 표시중 — 충돌 양보
const VISIT_SHOWN_KEY = 'push_visit_shown'             // 자동 visit 세션당 1회 가드
const ENGAGED_KEY = 'twa_session_post_views'           // 정독 카운트(PostViewBeacon) — visit 발동 조건

// 트리거별 문구 (간결안 — 메인 한 줄 + 서브에 "소식·혜택" 명시 = 마케팅 동의 근거)
const MESSAGES: Record<TriggerType, { main: string; sub: string }> = {
  signup:  { main: '🌱 환영해요! 알림 받으시겠어요?',     sub: '답글·새 소식·혜택 · 언제든 끄기' },
  post:    { main: '🔔 답글 오면 바로 알려드릴까요?',     sub: '우나어 소식·혜택도 함께 · 언제든 끄기' },
  comment: { main: '🔔 답글 오면 바로 알려드릴까요?',     sub: '우나어 소식·혜택도 함께 · 언제든 끄기' },
  visit:   { main: '🔔 내 글 소식, 알림 받으시겠어요?',   sub: '답글·소식·혜택 · 언제든 끄기' },
  job:     { main: '🔔 맞는 일자리가 올라오면 알려드릴게요', sub: '언제든 끄기' },
}

export function PushPermissionToast() {
  const [trigger, setTrigger] = useState<TriggerType | null>(null)
  const [visible, setVisible] = useState(false)
  const env = useAppEnvironment()
  const { status } = useAppSession()

  const statusRef = useRef(status)
  const shownRef = useRef(false)   // 세션(마운트)당 1회 — 한번 띄우면 추가 트리거 무시
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 노출 적격 — AND 전부 (호출 시점에 fresh 평가)
  const eligible = useCallback((): boolean => {
    if (!flags.pushToast) return false
    if (!env.supportsWebPush) return false
    if (statusRef.current !== 'authenticated') return false   // 로그인 회원만(비회원 제외)
    if (!canAskPushPermission()) return false                 // 미허용+미차단+쿨다운 경과
    try {
      if (sessionStorage.getItem(POPUP_VISIBLE_KEY)) return false  // PWA 설치팝업 표시중 → 양보
      if (sessionStorage.getItem(ADMIN_POPUP_KEY)) return false    // 어드민 공지팝업 표시중 → 양보
    } catch { return false }
    return true
  }, [env.supportsWebPush])

  const show = useCallback((type: TriggerType) => {
    shownRef.current = true
    setTrigger(type)
    // 가입 직후(signup)엔 홈 첫 전환 체감을 위해 더 늦게 표시. 나머지 트리거는 기존 500ms.
    const delay = type === 'signup' ? 1800 : 500
    timerRef.current = setTimeout(() => setVisible(true), delay)  // 작업 직후 자연스럽게
    trackEvent('push_prompt_shown', { trigger: type })
  }, [])

  // 재호출 가능한 평가 — 마운트/이벤트/세션변경 시 호출
  const evaluate = useCallback(() => {
    if (shownRef.current) return
    if (!eligible()) return
    let t: string | null = null
    try { t = sessionStorage.getItem(TRIGGER_KEY) } catch { /* noop */ }
    // (A) 명시 트리거 우선 — 1회성 소비
    if (t && (['post', 'comment', 'signup', 'job'] as TriggerType[]).includes(t as TriggerType)) {
      try { sessionStorage.removeItem(TRIGGER_KEY) } catch { /* noop */ }
      show(t as TriggerType)
      return
    }
    // (B) 자동 visit — 명시 없을 때만, 정독 1회 이상, 세션당 1회
    try {
      if (!sessionStorage.getItem(VISIT_SHOWN_KEY) && Number(sessionStorage.getItem(ENGAGED_KEY) || '0') >= 1) {
        sessionStorage.setItem(VISIT_SHOWN_KEY, '1')
        show('visit')
      }
    } catch { /* noop */ }
  }, [eligible, show])

  // 세션 상태 변경 시 ref 갱신 + 재평가 (리스너는 건드리지 않음)
  useEffect(() => {
    statusRef.current = status
    evaluate()
  }, [status, evaluate])

  // 리스너 등록은 마운트 1회만 (재실행 시 중복 등록 방지 — 주의#2)
  useEffect(() => {
    const onSignal = () => evaluate()
    window.addEventListener('unao:push-trigger', onSignal)  // 명시 트리거(같은 페이지/(main) 내 네비) — 주의#1
    window.addEventListener('unao:engaged', onSignal)        // 정독 → visit
    evaluate()                                               // 마운트 시 1회(직접진입/리로드 폴백)
    return () => {
      window.removeEventListener('unao:push-trigger', onSignal)
      window.removeEventListener('unao:engaged', onSignal)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAllow() {
    setVisible(false)
    const t = trigger
    // 구독 생성은 공용 함수(설정 '알림 받기' 버튼과 공유). 후처리(기록/트래킹)는 여기서.
    const result = await subscribeToPush()
    if (result === 'granted') {
      recordGranted()
      trackEvent('push_prompt_allowed', { trigger: t })
    } else if (result === 'denied') {
      recordDenied()
      trackEvent('push_prompt_denied', { trigger: t, reason: 'blocked' })
    }
    // unsupported/error: 권한 허용됐으나 저장 실패 등 — 기록 안 함(다음 기회에 재시도). UI 영향 없음.
  }

  function handleLater() {
    recordDenied()
    trackEvent('push_prompt_denied', { trigger, reason: 'later' })
    setVisible(false)
  }

  if (!visible || !trigger) return null

  const { main, sub } = MESSAGES[trigger]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[250] w-full bg-card border-t border-border shadow-lg safe-area-pb">
      <div className="flex flex-col gap-2.5 px-5 py-4">
        <p className="text-[17px] leading-snug font-semibold text-foreground">{main}</p>
        <p className="text-[13px] leading-snug text-muted-foreground">{sub}</p>
        <div className="flex flex-col gap-2 mt-0.5">
          <button
            onClick={handleAllow}
            className="h-[52px] w-full rounded-xl bg-primary text-white text-[17px] font-semibold active:opacity-80"
          >
            받을게요
          </button>
          <button
            onClick={handleLater}
            className="h-[44px] w-full text-[15px] text-muted-foreground active:opacity-70"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 푸시 토스트 트리거 설정 (댓글/글쓰기/가입 직후 호출).
 * ⚠️ 주의#1: sessionStorage 쓰기 **먼저** → dispatch **나중** (dispatch 동기 → 리스너가 sessionStorage 즉시 읽음).
 */
export function setPushToastTrigger(type: TriggerType) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(TRIGGER_KEY, type)
  } catch {
    /* sessionStorage 불가 환경 무시 */
  }
  window.dispatchEvent(new CustomEvent('unao:push-trigger'))
}
