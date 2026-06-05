'use client'

import { useEffect } from 'react'
import { debugBeacon } from '@/lib/debug-beacon'

// [임시 진단] 전역 JS 에러 + 앱 마운트 단계 비콘 → EventLog(debug_*).
// 안드로이드 로그아웃 후 홈 크래시 원인 특정용. 확정·수정 후 제거.
export default function ClientErrorBeacon() {
  useEffect(() => {
    debugBeacon('debug_stage', { stage: 'app_mounted' })

    const onError = (e: ErrorEvent) => {
      debugBeacon('debug_error', {
        msg: String(e.message ?? '').slice(0, 300),
        src: String(e.filename ?? '').slice(0, 200),
        line: e.lineno,
        col: e.colno,
        stack: String(e.error?.stack ?? '').slice(0, 600),
      })
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string; stack?: string } | undefined
      debugBeacon('debug_error', {
        msg: 'unhandledrejection: ' + String(reason?.message ?? e.reason).slice(0, 300),
        stack: String(reason?.stack ?? '').slice(0, 600),
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
