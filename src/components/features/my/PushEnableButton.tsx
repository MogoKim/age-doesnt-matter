'use client'

import { useEffect, useState } from 'react'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push/subscribe'

/**
 * 설정 페이지 '휴대폰 알림 받기' — 자동 토스트와 별개의 영구 진입점.
 * 사용자가 명시적으로 누르므로 쿨다운(canAskPushPermission)을 거치지 않고 바로 구독 시도.
 */
export default function PushEnableButton() {
  const env = useAppEnvironment()
  const [hasSub, setHasSub] = useState<boolean | null>(null) // null=확인 중
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  // 실제 구독 존재 여부 확인 (권한 granted라도 구독이 끊겼을 수 있음)
  useEffect(() => {
    if (!env.supportsWebPush) { setHasSub(false); return }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setHasSub(!!s))
      .catch(() => setHasSub(false))
  }, [env.supportsWebPush])

  async function handleEnable() {
    setBusy(true); setMsg(null)
    const r = await subscribeToPush()
    setBusy(false)
    if (r === 'granted') {
      setHasSub(true); setOk(true)
      setMsg('휴대폰 알림이 켜졌어요. 답글·새 소식을 바로 받아요.')
    } else if (r === 'denied') {
      setOk(false)
      setMsg('알림이 차단돼 있어요. 휴대폰 설정 > 알림에서 우나어를 허용해 주세요.')
    } else if (r === 'unsupported') {
      setOk(false)
      setMsg('이 브라우저는 휴대폰 알림을 지원하지 않아요.')
    } else {
      setOk(false)
      setMsg('잠시 후 다시 시도해 주세요.')
    }
  }

  async function handleDisable() {
    setBusy(true); setMsg(null)
    const r = await unsubscribeFromPush()
    setBusy(false)
    if (r === 'ok') {
      setHasSub(false); setOk(false)
      setMsg('휴대폰 알림을 껐어요. 언제든 다시 켤 수 있어요.')
    } else {
      setOk(false)
      setMsg('잠시 후 다시 시도해 주세요.')
    }
  }

  // 1) 미지원 환경
  if (!env.supportsWebPush) {
    return (
      <p className="text-[17px] leading-snug text-muted-foreground">
        이 브라우저는 휴대폰 알림을 지원하지 않아요. 우나어 앱이나 크롬에서 켤 수 있어요.
      </p>
    )
  }

  // 2) 브라우저/OS 영구 차단
  if (env.notificationPermission === 'denied') {
    return (
      <p className="text-[17px] leading-snug text-muted-foreground">
        알림이 차단돼 있어요. <b className="text-foreground">휴대폰 설정 &gt; 알림</b>에서 우나어 알림을 허용해 주세요.
      </p>
    )
  }

  // 3) 이미 구독 중 — 끄기 버튼 제공
  if (hasSub === true) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[18px]" aria-hidden>🔔</span>
          <p className="text-[17px] font-medium text-foreground">휴대폰 알림이 켜져 있어요</p>
        </div>
        <button
          type="button"
          onClick={handleDisable}
          disabled={busy}
          className="h-[52px] w-full rounded-xl border border-border bg-background text-[17px] font-semibold text-muted-foreground active:opacity-80 disabled:opacity-50"
        >
          {busy ? '끄는 중…' : '🔕 알림 끄기'}
        </button>
        {msg && <p className="text-[15px] leading-snug text-muted-foreground">{msg}</p>}
      </div>
    )
  }

  // 4) 켜기 버튼 (default 또는 권한은 있으나 구독 없음)
  return (
    <div className="space-y-3">
      <p className="text-[17px] leading-snug text-muted-foreground">
        휴대폰 알림을 켜면 내 글 답글·새 소식을 바로 받아볼 수 있어요.
      </p>
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy || hasSub === null}
        className="h-[52px] w-full rounded-xl bg-primary text-white text-[17px] font-semibold active:opacity-80 disabled:opacity-50"
      >
        {busy ? '켜는 중…' : '📱 휴대폰 알림 받기'}
      </button>
      {msg && (
        <p className={`text-[15px] leading-snug ${ok ? 'text-foreground' : 'text-muted-foreground'}`}>{msg}</p>
      )}
    </div>
  )
}
