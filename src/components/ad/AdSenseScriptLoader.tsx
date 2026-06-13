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
