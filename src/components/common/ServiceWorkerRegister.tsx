'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          // VAPID 키를 SW에 postMessage로 전달 (pushsubscriptionchange 갱신용)
          navigator.serviceWorker.ready.then((reg) => {
            reg.active?.postMessage({
              type: 'SET_VAPID_KEY',
              key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            })
          })
        })
        .catch((err) => {
          console.warn('[SW] registration failed:', err)
        })
    }
  }, [])

  return null
}
