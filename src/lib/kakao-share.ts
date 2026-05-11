/**
 * 카카오톡 공유하기 유틸리티 (클라이언트 전용)
 * Kakao JavaScript SDK를 동적으로 로드합니다.
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'

/** SDK 미초기화/로드 실패 시 링크 복사로 대체됐음을 알리는 에러 */
export class KakaoUnavailableError extends Error {
  readonly copiedUrl: string
  constructor(url: string) {
    super('KAKAO_UNAVAILABLE')
    this.copiedUrl = url
  }
}

// Fix A: Singleton Promise — 동시 호출 시 하나의 Promise 공유 (isLoading 레이스 컨디션 제거)
let sdkPromise: Promise<void> | null = null

async function ensureKakaoSDK(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.Kakao?.isInitialized()) return

  if (!sdkPromise) {
    sdkPromise = (async () => {
      // 이미 script 태그 삽입된 경우 로드 생략
      if (!document.querySelector('script[src*="kakao_js_sdk"]')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
          script.integrity = 'sha384-DKYJZ8NLiK8MN4/C5P2ezmFnkrysYIcIJf/rKaAvTEi4wFJSkmSm3JRBY/je6yX'
          script.crossOrigin = 'anonymous'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Kakao SDK 로드 실패'))
          document.head.appendChild(script)
        })
      }

      const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
      if (kakaoKey && window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(kakaoKey)
      }
    })().catch((err) => {
      // Fix B: 에러 시 sdkPromise 리셋 → 재시도 가능
      sdkPromise = null
      throw err
    })
  }

  await sdkPromise
}

interface SharePostParams {
  title: string
  description: string
  imageUrl?: string
  url: string
}

export async function shareToKakao(params: SharePostParams): Promise<void> {
  const fullUrl = params.url.startsWith('http') ? params.url : `${APP_URL}${params.url}`

  try {
    await ensureKakaoSDK()
  } catch {
    // SDK 로드 실패 → 링크 복사 후 KakaoUnavailableError throw (호출부에서 토스트 처리)
    await copyToClipboardSilent(fullUrl)
    throw new KakaoUnavailableError(fullUrl)
  }

  if (!window.Kakao?.isInitialized()) {
    // SDK 로드됐지만 JS 키 미설정 → 링크 복사 대체
    await copyToClipboardSilent(fullUrl)
    throw new KakaoUnavailableError(fullUrl)
  }

  // Fix C: navigator.share 제거 — 데스크탑에서 AbortError 유발하던 폴백 삭제
  window.Kakao.Share.sendDefault({
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

/**
 * URL 복사로 공유
 */
export async function copyShareLink(url: string): Promise<boolean> {
  try {
    const fullUrl = `${APP_URL}${url}`
    await navigator.clipboard.writeText(fullUrl)
    return true
  } catch {
    return false
  }
}
