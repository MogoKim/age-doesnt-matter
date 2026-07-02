'use client'

import { useEffect } from 'react'
import { ADSENSE } from './ad-slots'

const ADSENSE_SCRIPT_ID = 'unao-adsbygoogle-script'
export const ADSENSE_READY_EVENT = 'unao:adsense-ready'

type AdSenseWindow = Window & {
  adsbygoogle?: Record<string, unknown>[]
  __unaoAdsenseLoaded?: boolean
}

export default function AdSenseScriptLoader() {
  useEffect(() => {
    // Capacitor 네이티브 앱(iOS/Android shell)에서만 AdSense 스크립트를 차단한다.
    //   → 앱 내 WebView AdSense 게재는 정책 위반 위험(계정 보호). 웹/TWA(Chrome)는 정상 로드.
    //   판정 기준: window.Capacitor 존재 여부가 아니라 isNativePlatform()===true.
    //   (일부 웹 환경에서 window.Capacitor가 주입될 수 있으나 isNativePlatform()=false → 웹에선 로드돼야 함)
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.() === true) return

    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.CLIENT_ID}`
    const win = window as AdSenseWindow

    win.adsbygoogle = win.adsbygoogle || []

    const notifyReady = () => {
      win.__unaoAdsenseLoaded = true
      window.dispatchEvent(new Event(ADSENSE_READY_EVENT))
    }

    if (win.__unaoAdsenseLoaded) {
      notifyReady()
      return
    }

    const existingScript = (
      document.getElementById(ADSENSE_SCRIPT_ID) ??
      document.querySelector(`script[src="${src}"]`)
    ) as HTMLScriptElement | null

    if (existingScript) {
      existingScript.addEventListener('load', notifyReady, { once: true })
      return () => {
        existingScript.removeEventListener('load', notifyReady)
      }
    }

    const script = document.createElement('script')
    script.id = ADSENSE_SCRIPT_ID
    script.async = true
    script.src = src
    script.crossOrigin = 'anonymous'
    script.addEventListener('load', notifyReady, { once: true })
    document.head.appendChild(script)

    return () => {
      script.removeEventListener('load', notifyReady)
    }
  }, [])

  return null
}
