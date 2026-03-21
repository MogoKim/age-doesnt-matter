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

let isLoading = false

async function ensureKakaoSDK(): Promise<void> {
  if (typeof window === 'undefined') return

  if (window.Kakao?.isInitialized()) return

  if (!isLoading) {
    isLoading = true
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
      script.integrity = 'sha384-DKYJZ8NLiK8MN4/C5P2ezmFnkrysYIcIJf/rKaAvTEi4wFJSkmSm3JRBY/je6yX'
      script.crossOrigin = 'anonymous'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Kakao SDK 로드 실패'))
      document.head.appendChild(script)
    })

    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
    if (kakaoKey && window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(kakaoKey)
    }
  }
}

interface SharePostParams {
  title: string
  description: string
  imageUrl?: string
  url: string
}

export async function shareToKakao(params: SharePostParams): Promise<void> {
  await ensureKakaoSDK()

  if (!window.Kakao?.isInitialized()) {
    // 카카오 SDK 미초기화 시 Web Share API로 대체
    if (navigator.share) {
      await navigator.share({
        title: params.title,
        text: params.description,
        url: params.url,
      })
      return
    }
    // 클립보드 복사 대체
    await navigator.clipboard.writeText(params.url)
    return
  }

  const baseUrl = 'https://age-doesnt-matter.com'

  window.Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title: params.title,
      description: params.description,
      imageUrl: params.imageUrl || `${baseUrl}/og-image.png`,
      link: {
        mobileWebUrl: `${baseUrl}${params.url}`,
        webUrl: `${baseUrl}${params.url}`,
      },
    },
    buttons: [
      {
        title: '자세히 보기',
        link: {
          mobileWebUrl: `${baseUrl}${params.url}`,
          webUrl: `${baseUrl}${params.url}`,
        },
      },
    ],
  })
}

/**
 * URL 복사로 공유
 */
export async function copyShareLink(url: string): Promise<boolean> {
  try {
    const fullUrl = `https://age-doesnt-matter.com${url}`
    await navigator.clipboard.writeText(fullUrl)
    return true
  } catch {
    return false
  }
}
