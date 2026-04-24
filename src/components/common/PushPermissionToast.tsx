'use client'

import { useState, useEffect } from 'react'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { canAskPushPermission, recordDenied, recordGranted } from '@/lib/push/permission'
import { flags } from '@/lib/feature-flags'

type TriggerType = 'comment' | 'job'

const TRIGGER_KEY = 'push_toast_trigger'
const POPUP_VISIBLE_KEY = 'pwa_shown_this_session'

export function PushPermissionToast() {
  const [trigger, setTrigger] = useState<TriggerType | null>(null)
  const [visible, setVisible] = useState(false)
  const env = useAppEnvironment()

  useEffect(() => {
    if (!flags.pushToast) return
    if (!env.supportsWebPush) return

    // AddToHomeScreen 팝업이 표시 중이면 토스트 숨김
    if (sessionStorage.getItem(POPUP_VISIBLE_KEY)) return

    if (!canAskPushPermission()) return

    const pendingTrigger = sessionStorage.getItem(TRIGGER_KEY) as TriggerType | null
    if (!pendingTrigger) return

    sessionStorage.removeItem(TRIGGER_KEY)
    setTrigger(pendingTrigger)

    // 500ms 딜레이 후 표시 (UX: 작업 완료 직후 자연스럽게)
    const timer = setTimeout(() => setVisible(true), 500)
    return () => clearTimeout(timer)
  }, [env.supportsWebPush])

  async function handleAllow() {
    setVisible(false)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        recordDenied()
        return
      }

      recordGranted()

      const reg = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) return

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
    } catch {
      // 실패해도 UI에 영향 없음
    }
  }

  function handleLater() {
    recordDenied()
    setVisible(false)
  }

  if (!visible || !trigger) return null

  const message =
    trigger === 'comment'
      ? '누군가 답변을 남기면 바로 알려드릴까요?'
      : '나에게 맞는 일자리가 올라오면 바로 알려드릴게요.'

  const icon = trigger === 'comment' ? '🔔' : '📋'

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[250] w-full bg-card border-t border-border shadow-lg safe-area-pb">
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-[17px] leading-snug text-foreground">
          {icon} {message}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleAllow}
            className="h-[52px] w-full rounded-xl bg-primary text-white text-[17px] font-semibold active:opacity-80"
          >
            예, 알려주세요
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

/** sessionStorage에서 푸시 토스트 트리거 설정 (댓글/글 작성 직후 호출) */
export function setPushToastTrigger(type: TriggerType) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(TRIGGER_KEY, type)
}

// VAPID public key (URL-safe Base64) → Uint8Array 변환
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}
