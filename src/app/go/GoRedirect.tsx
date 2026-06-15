'use client'

import { useEffect, useState } from 'react'
import { detectEnv } from '@/components/common/AddToHomeScreen'
import { buildAndroidIntentUrlRaw, buildPlayStoreUrlRaw } from '@/lib/app-links'

/**
 * SNS/메신저에서 진입하는 앱 분기 라우터.
 * - 안드로이드 카톡: Play스토어 직접 (카톡은 intent를 차단 — OneLink·Airbridge도 동일)
 * - 안드로이드 그 외(메타/네이버/외부 크롬): intent → 앱 있으면 앱, 없으면 스토어(intent 내장 폴백)
 * - iOS / PC: 웹
 *
 * ⚠️ 자동 스토어 폴백(setTimeout)은 두지 않는다. 메타(인스타/페북)의 "외부 앱 열기 확인창"이
 * 뜬 동안 폴백이 발동해 앱 대신 스토어로 튀는 버그가 있었음. intent의 browser_fallback_url에 일임.
 *
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
      // 그 외 안드로이드: intent로 앱 시도. 미설치 시 intent 내장 browser_fallback_url(스토어)로.
      // 자동 setTimeout 폴백은 두지 않음(메타 확인창 방해 방지).
      window.location.href = buildAndroidIntentUrlRaw(to, referrer)
    } else {
      // iOS / PC: 웹
      window.location.replace(webTo)
    }

    // 자동 전환이 막히는 환경(스레드 등) 대비 수동 버튼 노출
    const btnTimer = setTimeout(() => setShowFallback(true), 1500)
    return () => clearTimeout(btnTimer)
  }, [to, referrer, webTo])

  const intentHref = buildAndroidIntentUrlRaw(to, referrer)
  const storeHref = buildPlayStoreUrlRaw(referrer)

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
            <p className="text-[15px] text-muted-foreground leading-relaxed mb-1">
              앱이 안 열리나요? 오른쪽 위{' '}
              <b className="text-foreground">⋮</b> →{' '}
              <b className="text-foreground">다른 브라우저로 열기</b>를 눌러 주세요.
            </p>
          )}
          {isAndroid && !isKakao && (
            <a
              href={intentHref}
              className="w-full min-h-[52px] flex items-center justify-center rounded-xl bg-primary text-white text-[18px] font-bold"
            >
              앱으로 열기
            </a>
          )}
          {isAndroid && (
            <a
              href={storeHref}
              className="w-full min-h-[52px] flex items-center justify-center rounded-xl bg-primary text-white text-[18px] font-bold"
            >
              스토어에서 설치
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
