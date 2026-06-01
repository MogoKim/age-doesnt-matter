/**
 * 카카오톡 공유하기 유틸리티 (클라이언트 전용)
 * Kakao SDK는 KakaoSdkScript(afterInteractive)가 페이지 로드 후 미리 초기화합니다.
 * 클릭 시점에는 isInitialized() 확인 후 sendDefault()로 바로 진행합니다.
 */

import { logKakaoShareDebug, getKakaoRuntimeSnapshot } from '@/lib/kakao-share-debug'

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void
      isInitialized: () => boolean
      Share: {
        sendDefault: (options: KakaoShareOptions) => void
      }
    }
    __KAKAO_SHARE_DIAG__?: {
      scriptMountedAt?: string
      scriptReadyAt?: string
      scriptLoadAt?: string
      scriptErrorAt?: string
      keyPresent?: boolean
      keyLength?: number
      hasKakaoAfterLoad?: boolean
      initializedBeforeInit?: boolean | null
      initializedAfterInit?: boolean | null
      hasShareAfterInit?: boolean
      initErrorName?: string
      initErrorMessage?: string
      lastWaitTimeoutAt?: string
    }
  }
}

interface KakaoShareOptions {
  objectType: 'feed'
  content: {
    title: string
    description: string
    imageUrl: string
    link: {
      mobileWebUrl: string
      webUrl: string
    }
  }
  buttons?: Array<{
    title: string
    link: {
      mobileWebUrl: string
      webUrl: string
    }
  }>
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

/** SDK 미초기화/로드 실패 시 링크 복사로 대체됐음을 알리는 에러 */
export class KakaoUnavailableError extends Error {
  readonly copiedUrl: string
  readonly reason: 'timeout' | 'unavailable' | 'sendDefaultThrow' | 'unknown'
  constructor(url: string, reason: 'timeout' | 'unavailable' | 'sendDefaultThrow' | 'unknown' = 'unknown') {
    super('KAKAO_UNAVAILABLE')
    this.copiedUrl = url
    this.reason = reason
  }
}

/**
 * KakaoSdkScript(afterInteractive)가 SDK를 로드/초기화할 때까지 대기.
 * 이미 초기화됐으면 즉시 true 반환. 최대 5초 폴링 후 false.
 */
function waitForKakaoInit(timeoutMs = 5000): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Kakao?.isInitialized()) return Promise.resolve(true)

  return new Promise<boolean>(resolve => {
    const interval = 100
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += interval
      if (window.Kakao?.isInitialized()) {
        clearInterval(timer)
        resolve(true)
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, interval)
  })
}

async function copyToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

interface SharePostParams {
  title: string
  description: string
  imageUrl?: string
  url: string
}

export async function shareToKakao(params: SharePostParams): Promise<void> {
  const fullUrl = params.url.startsWith('http') ? params.url : `${APP_URL}${params.url}`
  const startTs = Date.now()

  if (typeof window === 'undefined') {
    throw new KakaoUnavailableError(fullUrl, 'unknown')
  }

  logKakaoShareDebug('WAIT_INIT_START', getKakaoRuntimeSnapshot({ fullUrl }))

  const initialized = await waitForKakaoInit()

  if (!initialized) {
    const now = new Date().toISOString()
    const elapsed = Date.now() - startTs
    if (window.__KAKAO_SHARE_DIAG__) window.__KAKAO_SHARE_DIAG__.lastWaitTimeoutAt = now
    const sdkEl = document.getElementById('kakao-js-sdk') as HTMLScriptElement | null
    const timeoutPayload = {
      diag: window.__KAKAO_SHARE_DIAG__ ?? null,
      scriptEl: {
        id: sdkEl?.id ?? null,
        src: sdkEl?.src ?? null,
        integrity: sdkEl?.getAttribute('integrity') ?? null,
        crossOrigin: sdkEl?.getAttribute('crossorigin') ?? null,
      },
      readyState: document.readyState,
      href: window.location.href,
      hasKakao: !!window.Kakao,
      initialized: false,
      hasSendDefault: typeof window.Kakao?.Share?.sendDefault,
      elapsed,
    }
    logKakaoShareDebug('WAIT_INIT_TIMEOUT', timeoutPayload)
    console.error('[kakao-share] SDK_INIT_TIMEOUT', timeoutPayload)
    logKakaoShareDebug('FALLBACK_COPY_START', { reason: 'timeout', fullUrl })
    const copied = await copyToClipboard(fullUrl)
    logKakaoShareDebug(copied ? 'FALLBACK_COPY_OK' : 'FALLBACK_COPY_FAILED', { reason: 'timeout', fullUrl })
    throw new KakaoUnavailableError(fullUrl, 'timeout')
  }

  logKakaoShareDebug('WAIT_INIT_OK', getKakaoRuntimeSnapshot({ elapsed: Date.now() - startTs }))

  const kakao = window.Kakao
  if (!kakao?.isInitialized()) {
    const elapsed = Date.now() - startTs
    const unavailPayload = { hasKakao: !!kakao, initialized: false, elapsed }
    logKakaoShareDebug('SDK_UNAVAILABLE', unavailPayload)
    console.error('[kakao-share] SDK_UNAVAILABLE', unavailPayload)
    logKakaoShareDebug('FALLBACK_COPY_START', { reason: 'unavailable', fullUrl })
    const copied = await copyToClipboard(fullUrl)
    logKakaoShareDebug(copied ? 'FALLBACK_COPY_OK' : 'FALLBACK_COPY_FAILED', { reason: 'unavailable', fullUrl })
    throw new KakaoUnavailableError(fullUrl, 'unavailable')
  }

  const elapsedBeforeSend = Date.now() - startTs
  const snapshot = getKakaoRuntimeSnapshot()
  // localStorage에 먼저 기록 — sendDefault() 호출 전이므로 페이지 이탈 시에도 보존됨
  logKakaoShareDebug('SEND_DEFAULT_START', {
    snapshot,
    href: window.location.href,
    fullUrl,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    elapsed: elapsedBeforeSend,
  })
  console.info('[kakao-share] SEND_DEFAULT_START', {
    initialized: true,
    host: window.location.host,
    path: window.location.pathname,
  })

  try {
    kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: params.title,
        description: params.description,
        imageUrl: params.imageUrl || `${APP_URL}/og-image.png`,
        link: {
          mobileWebUrl: fullUrl,
          webUrl: fullUrl,
        },
      },
      buttons: [
        {
          title: '자세히 보기',
          link: {
            mobileWebUrl: fullUrl,
            webUrl: fullUrl,
          },
        },
      ],
    })
    logKakaoShareDebug('SEND_DEFAULT_RETURNED', { elapsed: Date.now() - startTs })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const throwPayload = {
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
      elapsed: Date.now() - startTs,
    }
    logKakaoShareDebug('SEND_DEFAULT_THROW', throwPayload)
    console.error('[kakao-share] SEND_DEFAULT_FAILED', throwPayload)
    logKakaoShareDebug('FALLBACK_COPY_START', { reason: 'sendDefaultThrow', fullUrl })
    const copied = await copyToClipboard(fullUrl)
    logKakaoShareDebug(copied ? 'FALLBACK_COPY_OK' : 'FALLBACK_COPY_FAILED', { reason: 'sendDefaultThrow', fullUrl })
    throw new KakaoUnavailableError(fullUrl, 'sendDefaultThrow')
  }
}

export async function copyShareLink(url: string): Promise<boolean> {
  try {
    const fullUrl = `${APP_URL}${url}`
    await navigator.clipboard.writeText(fullUrl)
    return true
  } catch {
    return false
  }
}
