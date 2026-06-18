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
    // Capacitor 네이티브 앱(iOS/Android shell)에서는 AdSense 스크립트를 로드하지 않는다.
    //   → 앱 내 WebView AdSense 게재는 정책 위반 위험(계정 보호). 웹/TWA(Chrome)는 영향 없음.
    //   window.Capacitor는 네이티브 런타임만 주입(웹 미탑재) → 웹/TWA에선 항상 미발동.
    if ((window as Window & { Capacitor?: unknown }).Capacitor) return

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
