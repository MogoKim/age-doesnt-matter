'use client'

export const KAKAO_SHARE_DEBUG_ENABLED_KEY = 'kakaoShareDebugEnabled'
export const KAKAO_SHARE_LOGS_KEY = 'kakaoShareLogs'

export interface KakaoShareLogEntry {
  ts: string
  event: string
  href: string
  userAgent: string
  visibilityState: string
  readyState: string
  payload?: unknown
}

type Jsonish = string | number | boolean | null | Jsonish[] | { [key: string]: Jsonish }

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizePayload(value: unknown, depth = 0, seen = new WeakSet<object>()): Jsonish {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'symbol' || typeof value === 'function') return String(value)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    }
  }

  if (value instanceof Date) return value.toISOString()

  if (typeof Event !== 'undefined' && value instanceof Event) {
    return {
      type: value.type,
      timeStamp: value.timeStamp,
    }
  }

  if (typeof value !== 'object') return safeString(value)
  if (depth >= 4) return '[MaxDepth]'

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => normalizePayload(item, depth + 1, seen))
  }

  const out: Record<string, Jsonish> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    if (/kakao.*key|js.*key|secret|token/i.test(key)) {
      out[key] = '[redacted]'
      continue
    }
    out[key] = normalizePayload(item, depth + 1, seen)
  }
  return out
}

export function enableKakaoShareDebugFromQuery(): boolean {
  if (!canUseBrowserStorage()) return false

  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('kakaoDebug') === '1') {
      window.localStorage.setItem(KAKAO_SHARE_DEBUG_ENABLED_KEY, '1')
      return true
    }
    return window.localStorage.getItem(KAKAO_SHARE_DEBUG_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function isKakaoShareDebugEnabled(): boolean {
  if (!canUseBrowserStorage()) return false
  try {
    return (
      window.localStorage.getItem(KAKAO_SHARE_DEBUG_ENABLED_KEY) === '1' ||
      new URLSearchParams(window.location.search).get('kakaoDebug') === '1'
    )
  } catch {
    return false
  }
}

export function readKakaoShareDebugLogs(): KakaoShareLogEntry[] {
  if (!canUseBrowserStorage()) return []

  try {
    const raw = window.localStorage.getItem(KAKAO_SHARE_LOGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-100) : []
  } catch {
    return []
  }
}

export function clearKakaoShareDebugLogs() {
  if (!canUseBrowserStorage()) return
  window.localStorage.removeItem(KAKAO_SHARE_LOGS_KEY)
  window.dispatchEvent(new CustomEvent('kakao-share-debug-log'))
}

export async function copyKakaoShareDebugLogs(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  const logs = readKakaoShareDebugLogs()
  await navigator.clipboard.writeText(JSON.stringify(logs, null, 2))
  return true
}

export function getKakaoRuntimeSnapshot(extra?: Record<string, unknown>) {
  if (typeof window === 'undefined') return extra ?? {}

  const kakao = window.Kakao
  let initialized = false
  try {
    initialized = Boolean(kakao?.isInitialized?.())
  } catch {
    initialized = false
  }

  const scriptEl = document.getElementById('kakao-js-sdk') as HTMLScriptElement | null
  const diag = window.__KAKAO_SHARE_DIAG__

  return {
    ...extra,
    hasKakao: Boolean(kakao),
    initialized,
    hasSendDefault: typeof kakao?.Share?.sendDefault === 'function',
    scriptEl: scriptEl
      ? {
          id: scriptEl.id,
          src: scriptEl.src,
          integrity: scriptEl.integrity,
          crossOrigin: scriptEl.crossOrigin,
          dataStatus: scriptEl.dataset.status ?? null,
        }
      : null,
    diag: diag ?? null,
  }
}

export function logKakaoShareDebug(event: string, payload?: Record<string, unknown>) {
  if (!canUseBrowserStorage()) return

  const enabled = enableKakaoShareDebugFromQuery()
  if (!enabled) return

  const entry: KakaoShareLogEntry = {
    ts: new Date().toISOString(),
    event,
    href: window.location.href,
    userAgent: navigator.userAgent,
    visibilityState: document.visibilityState,
    readyState: document.readyState,
    payload: payload ? normalizePayload(payload) : undefined,
  }

  try {
    const logs = [...readKakaoShareDebugLogs(), entry].slice(-100)
    window.localStorage.setItem(KAKAO_SHARE_LOGS_KEY, JSON.stringify(logs))
    window.dispatchEvent(new CustomEvent('kakao-share-debug-log'))
  } catch {
    // Debug logging must never break the share UI.
  }

  // Keep a console trail too, but localStorage is the source of truth for mobile crashes.
  console.info('[kakao-share]', event, entry.payload ?? {})
}

export function attachKakaoGlobalDebugListeners(): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleError = (event: ErrorEvent) => {
    logKakaoShareDebug('WINDOW_ERROR', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    })
  }
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    logKakaoShareDebug('UNHANDLED_REJECTION', { reason: event.reason })
  }
  const handleVisibilityChange = () => {
    logKakaoShareDebug('VISIBILITY_CHANGE', { visibilityState: document.visibilityState })
  }
  const handlePageHide = (event: PageTransitionEvent) => {
    logKakaoShareDebug('PAGE_HIDE', { persisted: event.persisted })
  }
  const handlePageShow = (event: PageTransitionEvent) => {
    logKakaoShareDebug('PAGE_SHOW', { persisted: event.persisted })
  }
  const handleBlur = () => logKakaoShareDebug('WINDOW_BLUR')
  const handleFocus = () => logKakaoShareDebug('WINDOW_FOCUS')

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('blur', handleBlur)
  window.addEventListener('focus', handleFocus)

  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('pageshow', handlePageShow)
    window.removeEventListener('blur', handleBlur)
    window.removeEventListener('focus', handleFocus)
  }
}
