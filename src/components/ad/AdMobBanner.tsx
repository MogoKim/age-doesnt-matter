'use client'

import { useEffect } from 'react'
import { isAppNative } from '@/lib/analytics/app-analytics'

/**
 * AdMob 하단 배너 — **제거(teardown) 전용 컴포넌트**.
 *
 * 앱 광고 정책 전환으로 하단 anchored 배너를 폐지한다. 이 컴포넌트는 더 이상 배너를
 * 표시하지 않고, **이미 설치된 앱에 떠 있는 배너를 확실히 제거**하는 역할만 한다.
 *
 * [왜 removeBanner를 호출해야 하나]
 *   배너는 @capacitor-community/admob 플러그인이 만든 **네이티브 뷰**로 WebView DOM과 독립적이다.
 *   앱은 server.url(age-doesnt-matter.com)로 라이브 웹을 로드하므로, 새 웹을 배포해 showBanner
 *   호출을 없애도 **기존 vc21 앱에 이미 떠 있는 네이티브 배너는 WebView 새로고침만으로 사라지지 않는다**
 *   (앱 콜드 재시작 전까지 잔존). → 새 웹 로드 시 removeBanner()를 1회 호출해 콜드 재시작 없이 제거한다.
 *   그래서 마운트를 한동안 유지한다(기존 설치본 정리 목적). 이후 릴리스에서 완전히 제거 예정.
 *
 * - 웹/브라우저/TWA는 no-op(네이티브 아님).
 * - showBanner/resumeBanner/hideBanner/타이머/라우트 감지 로직은 전부 제거됨.
 * - interstitial / Native Advanced 는 이 컴포넌트와 무관(별도 도입).
 */

export default function AdMobBanner() {
  useEffect(() => {
    // 네이티브 앱에서만 — 웹/TWA는 아무것도 하지 않음.
    if (!isAppNative()) return

    // 기존에 생성된 하단 배너가 있으면 파괴(destroy). 없으면 no-op(에러는 삼킴).
    void (async () => {
      const { AdMob } = await import('@capacitor-community/admob')
      await AdMob.removeBanner().catch(() => {})
    })()
  }, [])

  return null
}
