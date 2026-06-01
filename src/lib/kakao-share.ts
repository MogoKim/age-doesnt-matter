/**
 * 카카오톡 공유하기 유틸리티 (클라이언트 전용)
 * Kakao SDK는 KakaoSdkScript(afterInteractive)가 페이지 로드 후 미리 초기화합니다.
 * 클릭 시점에는 isInitialized() 확인 후 sendDefault()로 바로 진행합니다.
 */

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void
      isInitialized: () => boolean
      Share: {
        sendDefault: (options: KakaoShareOptions) => void
      }
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
  constructor(url: string) {
    super('KAKAO_UNAVAILABLE')
    this.copiedUrl = url
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

interface SharePostParams {
  title: string
  description: string
  imageUrl?: string
  url: string
}

export async function shareToKakao(params: SharePostParams): Promise<void> {
  const fullUrl = params.url.startsWith('http') ? params.url : `${APP_URL}${params.url}`

  if (typeof window === 'undefined') {
    throw new KakaoUnavailableError(fullUrl)
  }

  const initialized = await waitForKakaoInit()
  if (!initialized) {
    console.error('[kakao-share] SDK 초기화 타임아웃 — KakaoSdkScript 로드 상태 확인 필요')
    await copyToClipboardSilent(fullUrl)
    throw new KakaoUnavailableError(fullUrl)
  }

  const kakao = window.Kakao
  if (!kakao?.isInitialized()) {
    await copyToClipboardSilent(fullUrl)
    throw new KakaoUnavailableError(fullUrl)
  }

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
}

async function copyToClipboardSilent(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // clipboard 접근 불가 시 무시
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
