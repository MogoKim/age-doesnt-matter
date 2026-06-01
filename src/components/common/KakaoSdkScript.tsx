'use client'

import { useEffect } from 'react'
import Script from 'next/script'

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
const SDK_INTEGRITY = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka'

type KakaoDiag = NonNullable<Window['__KAKAO_SHARE_DIAG__']>

function patchDiag(fields: Partial<KakaoDiag>) {
  const prev = window.__KAKAO_SHARE_DIAG__ ?? {}
  window.__KAKAO_SHARE_DIAG__ = { ...prev, ...fields } as KakaoDiag
}

export default function KakaoSdkScript() {
  useEffect(() => {
    const now = new Date().toISOString()
    window.__KAKAO_SHARE_DIAG__ = { scriptMountedAt: now }
    console.info('[kakao-share] SCRIPT_COMPONENT_MOUNTED', { mountedAt: now })
  }, [])

  function handleReady() {
    const now = new Date().toISOString()
    patchDiag({ scriptReadyAt: now })
    console.info('[kakao-share] SCRIPT_READY', { readyAt: now })
  }

  function handleLoad() {
    const now = new Date().toISOString()
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
    const keyPresent = Boolean(key)
    const keyLength = key?.length ?? 0
    patchDiag({ scriptLoadAt: now, keyPresent, keyLength })
    console.info('[kakao-share] SCRIPT_LOADED', { loadAt: now, keyPresent, keyLength })

    if (!key) {
      console.error('[kakao-share] KEY_MISSING', { keyPresent: false, keyLength: 0 })
      return
    }

    const hasKakaoAfterLoad = Boolean(window.Kakao)
    const initializedBeforeInit = window.Kakao?.isInitialized?.() ?? null
    patchDiag({ hasKakaoAfterLoad, initializedBeforeInit })
    console.info('[kakao-share] INIT_START', {
      hasKakao: hasKakaoAfterLoad,
      initializedBeforeInit,
      hasSendDefault: typeof window.Kakao?.Share?.sendDefault,
    })

    if (!window.Kakao) {
      patchDiag({ initializedAfterInit: false })
      console.error('[kakao-share] INIT_FALSE', { reason: 'window.Kakao undefined' })
      return
    }

    if (window.Kakao.isInitialized()) {
      const hasShareAfterInit = typeof window.Kakao?.Share?.sendDefault === 'function'
      patchDiag({ initializedAfterInit: true, hasShareAfterInit })
      console.info('[kakao-share] INIT_OK', {
        alreadyInitialized: true,
        initializedAfterInit: true,
        hasSendDefault: typeof window.Kakao?.Share?.sendDefault,
        hasShare: hasShareAfterInit,
      })
      return
    }

    try {
      window.Kakao.init(key)
      const initializedAfterInit = window.Kakao.isInitialized()
      const hasShareAfterInit = typeof window.Kakao?.Share?.sendDefault === 'function'
      patchDiag({ initializedAfterInit, hasShareAfterInit })
      if (initializedAfterInit) {
        console.info('[kakao-share] INIT_OK', {
          initializedAfterInit,
          hasSendDefault: typeof window.Kakao?.Share?.sendDefault,
          hasShare: hasShareAfterInit,
        })
      } else {
        console.error('[kakao-share] INIT_FALSE', {
          initializedAfterInit,
          hasSendDefault: typeof window.Kakao?.Share?.sendDefault,
          hasShare: hasShareAfterInit,
        })
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      patchDiag({ initializedAfterInit: false, initErrorName: err.name, initErrorMessage: err.message })
      console.error('[kakao-share] INIT_THROW', { name: err.name, message: err.message })
    }
  }

  function handleError() {
    const now = new Date().toISOString()
    patchDiag({ scriptErrorAt: now })
    console.error('[kakao-share] SCRIPT_ERROR', { errorAt: now })
  }

  return (
    <Script
      id="kakao-js-sdk"
      src={SDK_URL}
      integrity={SDK_INTEGRITY}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onReady={handleReady}
      onLoad={handleLoad}
      onError={handleError}
    />
  )
}
