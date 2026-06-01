'use client'

import Script from 'next/script'

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
const SDK_INTEGRITY = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka'

export default function KakaoSdkScript() {
  function handleLoad() {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
    if (!key) {
      console.error('[kakao-share] NEXT_PUBLIC_KAKAO_JS_KEY 미설정 — Vercel env 확인 필요')
      return
    }
    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(key)
    }
  }

  function handleError() {
    console.error('[kakao-share] SDK script 로드 실패 — SRI 해시 불일치 또는 네트워크 오류')
  }

  return (
    <Script
      id="kakao-js-sdk"
      src={SDK_URL}
      integrity={SDK_INTEGRITY}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={handleLoad}
      onError={handleError}
    />
  )
}
