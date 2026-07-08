'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { shareToKakao, KakaoUnavailableError, preloadKakaoSdk } from '@/lib/kakao-share'
import { gtmReferralShare } from '@/lib/gtm'
import { useToast } from '@/components/common/Toast'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { startKakaoLogin } from '@/lib/kakao-start'
import { trackEvent } from '@/lib/track'

interface PromoSettings {
  enabled: boolean
  tag: string
  text: string
  href: string
}

interface TopPromoBannerClientProps {
  guestSettings: PromoSettings | null
  memberSettings: PromoSettings | null
}

export default function TopPromoBannerClient({
  guestSettings,
  memberSettings,
}: TopPromoBannerClientProps) {
  const { data: session, status } = useAppSession()
  const { toast } = useToast()
  const pathname = usePathname()
  const { isCapacitor, isTWA, isStandalone } = useAppEnvironment()
  const isLoggedIn = status === 'authenticated'

  const type = isLoggedIn ? 'member' : 'guest'
  const settings = isLoggedIn ? memberSettings : guestSettings
  const sessionKey = `top-promo-${type}-dismissed`

  const [visible, setVisible] = useState(true)
  const shownFiredRef = useRef(false)

  useEffect(() => {
    if (sessionStorage.getItem(sessionKey)) {
      setVisible(false)
    } else {
      setVisible(true)
    }
  }, [sessionKey])

  // 프로모 배너가 카카오 공유(kakao:share)로 설정된 경우에만 SDK 미리 로드
  useEffect(() => {
    if (settings?.href === 'kakao:share') preloadKakaoSdk()
  }, [settings])

  // 카카오 로그인 직접 시작 액션 sentinel (kakao:share와 동일 패턴 — validatePromoHref/Panel과 동일 값)
  const isKakaoLogin = settings?.href === 'kakao:login'
  // 카카오 공유 액션 sentinel (admin.config.ts validatePromoHref / TopPromoBannerPanel과 동일 값)
  const isKakaoShare = settings?.href === 'kakao:share'
  const isExternalHref = !!settings && settings.href.startsWith('https://')

  // 이벤트 공통 payload — audience/action/browser_env/is_capacitor (signup_banner_* 와 분리된 top_promo_* 계열)
  const browserEnv = isCapacitor ? 'capacitor' : isTWA ? 'twa' : isStandalone ? 'standalone' : 'web'
  const promoAction: 'kakao_login' | 'kakao_share' | 'external' | 'internal' = isKakaoLogin
    ? 'kakao_login'
    : isKakaoShare
      ? 'kakao_share'
      : isExternalHref
        ? 'external'
        : 'internal'
  function trackPromo(eventName: 'top_promo_shown' | 'top_promo_clicked' | 'top_promo_dismissed') {
    trackEvent(eventName, {
      audience: type,
      action: promoAction,
      path: pathname,
      browser_env: browserEnv,
      is_capacitor: isCapacitor,
    })
  }

  // 노출 1회 기록 (visible & 표시 조건 충족 시). firedRef 가드 → 재노출/중복 발화 없음.
  useEffect(() => {
    if (!settings || !settings.enabled || !settings.text) return
    if (!visible || shownFiredRef.current) return
    shownFiredRef.current = true
    trackPromo('top_promo_shown')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, settings])

  if (!settings || !settings.enabled || !settings.text) return null
  if (!visible) return null

  const { tag, text, href } = settings

  function handleDismiss() {
    trackPromo('top_promo_dismissed')
    sessionStorage.setItem(sessionKey, '1')
    setVisible(false)
  }

  // 카카오 로그인 직접 시작 — 이벤트 flush 후 기존 startKakaoLogin(웹=OAuth / Capacitor=app-login handoff) 호출만.
  function handleKakaoLogin() {
    trackPromo('top_promo_clicked')
    // setTimeout(0): sendBeacon flush 여유 후 네비게이션 시작(KakaoSignupButton/PostCTA와 동일 패턴)
    window.setTimeout(() => startKakaoLogin(pathname), 0)
  }

  async function handleShare() {
    trackPromo('top_promo_clicked')
    const userId = session?.user?.id
    // 추천인 추적: UTM으로 실으면 captureUtm(PageViewTracker)이 랜딩 시 저장 → sign_up에 자동 포함
    const shareUrl =
      isLoggedIn && userId
        ? `/?utm_source=member_referral&utm_medium=kakao_share&utm_content=${userId}`
        : `/?utm_source=guest_referral&utm_medium=kakao_share`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
    gtmReferralShare(type)
    try {
      await shareToKakao({
        title: '우리 나이가 어때서 — 40·50·60 신중년 여성 커뮤니티',
        description: '엄마 말고, 아내 말고, 그냥 나로. 신중년 여성끼리 모이는 따뜻한 커뮤니티예요.',
        imageUrl: `${appUrl}/og-cover.png`,
        url: shareUrl,
      })
    } catch (err) {
      if (err instanceof KakaoUnavailableError) {
        toast('카카오톡을 열 수 없어 링크를 복사했어요', 'success')
      } else {
        toast('카카오톡 공유에 실패했어요', 'error')
      }
    }
  }

  const linkContent = (
    <span className="text-white text-[17px] font-semibold leading-snug line-clamp-2 flex-1 min-w-0">
      {text}
    </span>
  )

  return (
    <div
      className={`relative flex items-center justify-center gap-2 h-[56px] px-4 overflow-hidden text-center top-promo-enter${
        isKakaoLogin ? ' top-promo-sheen' : ''
      }`}
      style={{
        background: 'linear-gradient(90deg, var(--hero-1-from) 0%, var(--hero-1-mid) 50%, var(--hero-1-to) 100%)',
      }}
      role="banner"
      aria-label="프로모션 배너"
    >
      {tag && (
        <span
          className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/20 text-white text-caption font-semibold leading-none whitespace-nowrap${
            isKakaoLogin ? ' top-promo-tag-pulse' : ''
          }`}
        >
          {tag}
        </span>
      )}

      {isKakaoLogin ? (
        <button
          type="button"
          onClick={handleKakaoLogin}
          className="no-underline hover:underline flex-1 min-w-0 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer"
        >
          {linkContent}
        </button>
      ) : isKakaoShare ? (
        <button
          type="button"
          onClick={handleShare}
          className="no-underline hover:underline flex-1 min-w-0 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer"
        >
          {linkContent}
        </button>
      ) : isExternalHref ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackPromo('top_promo_clicked')}
          className="no-underline hover:underline flex-1 min-w-0 flex items-center"
        >
          {linkContent}
        </a>
      ) : (
        <Link
          href={href}
          onClick={() => trackPromo('top_promo_clicked')}
          className="no-underline hover:underline flex-1 min-w-0 flex items-center"
        >
          {linkContent}
        </Link>
      )}

      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 flex items-center justify-center w-[52px] h-[52px] rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors [-webkit-tap-highlight-color:transparent]"
        aria-label="배너 닫기"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
