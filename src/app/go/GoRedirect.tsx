'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { buildAndroidIntentUrl } from '@/lib/app-links'
import { gtmPlayStoreClick } from '@/lib/gtm'

/**
 * 카카오 웰컴메시지 버튼 등에서 진입하는 분기 라우터.
 * - 안드로이드: intent:// → 앱 있으면 앱, 없으면 Play스토어
 * - iOS / PC / 기타: 웹(`to`)으로 이동
 * 자동 이동이 인앱 브라우저에 막힐 때를 대비해 수동 버튼도 노출.
 */
export default function GoRedirect({ to }: { to: string }) {
  const [showFallback, setShowFallback] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    const env = detectEnv()
    const android = env === 'android-chrome'
    setIsAndroid(android)

    if (android) {
      gtmPlayStoreClick('welcome_msg')
      window.location.href = buildAndroidIntentUrl(to)
    } else {
      window.location.replace(to)
    }

    // 자동 이동이 막힌 경우(인앱 브라우저 차단 등) 수동 버튼 노출
    const timer = setTimeout(() => setShowFallback(true), 1500)
    return () => clearTimeout(timer)
  }, [to])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 bg-background text-center">
      <span className="text-5xl mb-5 block">🌸</span>
      <h1 className="text-2xl font-bold text-foreground mb-2">우나어로 이동 중…</h1>
      <p className="text-body text-muted-foreground leading-relaxed mb-8">
        잠시만 기다려 주세요.
        <br />
        화면이 바뀌지 않으면 아래 버튼을 눌러 주세요.
      </p>

      {showFallback && (
        <div className="w-full max-w-[360px] flex flex-col gap-3">
          {isAndroid && (
            <a
              href={buildAndroidIntentUrl(to)}
              className="w-full min-h-[52px] flex items-center justify-center rounded-xl bg-primary text-white text-[18px] font-bold"
              onClick={() => gtmPlayStoreClick('welcome_msg_manual')}
            >
              앱으로 열기
            </a>
          )}
          <a
            href={to}
            className="w-full min-h-[52px] flex items-center justify-center rounded-xl border-2 border-border text-foreground text-[18px] font-bold"
          >
            웹으로 보기
          </a>
        </div>
      )}
    </div>
  )
}
