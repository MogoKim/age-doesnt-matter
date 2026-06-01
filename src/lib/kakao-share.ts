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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
const SDK_INTEGRITY = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka'
const SDK_SCRIPT_ID = 'kakao-js-sdk'

/** SDK 미초기화/로드 실패 시 링크 복사로 대체됐음을 알리는 에러 */
export class KakaoUnavailableError extends Error {
  readonly copiedUrl: string
  constructor(url: string) {
    super('KAKAO_UNAVAILABLE')
    this.copiedUrl = url
  }
}

// 동시 호출 시 하나의 Promise 공유 (레이스 컨디션 방지)
let sdkPromise: Promise<void> | null = null

/**
 * script 태그 상태(data-status)를 보고 로드/대기/재삽입을 결정하는 robust loader.
 * - 'loading': 진행 중인 script의 load/error 이벤트를 기다림
 * - 'error' / 미상태: 태그 제거 후 재삽입
 * - 'loaded': 즉시 resolve
 * - 없음: 새로 삽입
 */
function loadSdkScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null

    if (existing) {
      const status = existing.getAttribute('data-status')
      if (status === 'loaded') {
        resolve()
        return
      }
      if (status === 'loading') {
        // 이미 로딩 중 — 완료 이벤트를 기다림
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Kakao SDK 로드 실패')), { once: true })
        return
      }
      // 'error' 또는 미상태 (이전 실패 잔여 태그) — 제거 후 재삽입
      existing.remove()
    }

    const script = document.createElement('script')
    script.id = SDK_SCRIPT_ID
    script.src = SDK_URL
    script.integrity = SDK_INTEGRITY
    script.crossOrigin = 'anonymous'
    script.setAttribute('data-status', 'loading')

    script.onload = () => {
      script.setAttribute('data-status', 'loaded')
      resolve()
    }
    script.onerror = () => {
      script.setAttribute('data-status', 'error')
      if (process.env.NODE_ENV === 'development') {
        console.warn('[kakao-share] SDK script 로드 실패 — SRI 해시 불일치 또는 네트워크 오류')
      }
      reject(new Error('Kakao SDK 로드 실패'))
    }

    document.head.appendChild(script)
  })
}

async function ensureKakaoSDK(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.Kakao?.isInitialized()) return

  if (!sdkPromise) {
    sdkPromise = (async () => {
      // window.Kakao가 없으면 script 로드 (있으면 이미 로드된 것)
      if (!window.Kakao) {
        await loadSdkScript()
      }

      // 로드 후에도 window.Kakao 없으면 로드 실패
      if (!window.Kakao) {
        throw new Error('window.Kakao 없음 — SDK 로드 실패')
      }

      const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
      if (!kakaoKey) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[kakao-share] NEXT_PUBLIC_KAKAO_JS_KEY 미설정')
        }
        throw new Error('Kakao JS 키 없음')
      }

      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(kakaoKey)
      }

      // init 후 상태 검증
      if (!window.Kakao.isInitialized()) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[kakao-share] Kakao.init() 호출 후에도 isInitialized()=false')
        }
        throw new Error('Kakao.init 실패')
      }
    })().catch((err: unknown) => {
      // 에러 시 sdkPromise 리셋 → 다음 클릭 때 재시도 가능
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
    // SDK 로드/init 실패 → 링크 복사 후 KakaoUnavailableError (호출부에서 토스트 처리)
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
