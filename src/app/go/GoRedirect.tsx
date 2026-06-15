'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { buildAndroidIntentUrlRaw, buildPlayStoreUrlRaw } from '@/lib/app-links'

/**
 * SNS/메신저에서 진입하는 앱 분기 라우터.
 * - 안드로이드 카톡: Play스토어 직접 (카톡은 intent를 차단 — OneLink·Airbridge도 동일)
 * - 안드로이드 그 외(메타/네이버/외부 크롬): intent → 앱 있으면 앱, 없으면 스토어 (+2초 폴백)
 * - iOS / PC: 웹
 * @param to       앱/웹 목적 내부 경로
 * @param referrer Play스토어 referrer (utm) 문자열
 * @param webTo    웹 이동 시 URL (utm 부착)
 */
export default function GoRedirect({
  to,
  referrer,
  webTo,
}: {
  to: string
  referrer: string
  webTo: string
}) {
  const [showFallback, setShowFallback] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [isKakao, setIsKakao] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const android = /android/i.test(ua)
    const env = detectEnv()
    const kakao = env === 'kakao-android' || env === 'kakao-ios' || /KAKAOTALK/i.test(ua)
    setIsAndroid(android)
    setIsKakao(kakao)

    if (android && kakao) {
      // 카톡 인앱은 앱 전환 차단 → 스토어로 (앱O="열기", 앱X=설치)
      window.location.href = buildPlayStoreUrlRaw(referrer)
    } else if (android) {
      // 그 외 안드로이드: intent로 앱 시도 (미설치 시 스토어 폴백 내장)
      window.location.href = buildAndroidIntentUrlRaw(to, referrer)
      // 인앱 WebView가 intent를 막아 페이지에 머무는 경우 2초 후 스토어 폴백.
      // 앱이 열려 화면이 숨겨지면(visibility hidden) 폴백 취소.
      const fallbackTimer = setTimeout(() => {
        window.location.href = buildPlayStoreUrlRaw(referrer)
      }, 2000)
      const cancel = () => {
        if (document.visibilityState === 'hidden') clearTimeout(fallbackTimer)
      }
      document.addEventListener('visibilitychange', cancel)
      const btnTimer = setTimeout(() => setShowFallback(true), 1500)
      return () => {
        clearTimeout(fallbackTimer)
        clearTimeout(btnTimer)
        document.removeEventListener('visibilitychange', cancel)
      }
    } else {
      // iOS / PC: 웹
      window.location.replace(webTo)
    }

    const btnTimer = setTimeout(() => setShowFallback(true), 1500)
    return () => clearTimeout(btnTimer)
  }, [to, referrer, webTo])

  const appHref =
    isAndroid && kakaoStoreOrIntent(isKakao, to, referrer)

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
              href={appHref || webTo}
              className="w-full min-h-[52px] flex items-center justify-center rounded-xl bg-primary text-white text-[18px] font-bold"
            >
              {isKakao ? '스토어로 이동' : '앱으로 열기'}
            </a>
          )}
          <a
            href={webTo}
            className="w-full min-h-[52px] flex items-center justify-center rounded-xl border-2 border-border text-foreground text-[18px] font-bold"
          >
            웹으로 보기
          </a>
        </div>
      )}
    </div>
  )
}

/** 수동 버튼용 안드로이드 링크: 카톡=스토어, 그 외=intent */
function kakaoStoreOrIntent(isKakao: boolean, to: string, referrer: string): string {
  return isKakao ? buildPlayStoreUrlRaw(referrer) : buildAndroidIntentUrlRaw(to, referrer)
}
