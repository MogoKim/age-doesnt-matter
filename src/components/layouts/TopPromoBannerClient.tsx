'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { shareToKakao, KakaoUnavailableError } from '@/lib/kakao-share'
import { gtmReferralShare } from '@/lib/gtm'
import { useToast } from '@/components/common/Toast'

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
  const { data: session, status } = useSession()
  const { toast } = useToast()
  const isLoggedIn = status === 'authenticated'

  const type = isLoggedIn ? 'member' : 'guest'
  const settings = isLoggedIn ? memberSettings : guestSettings
  const sessionKey = `top-promo-${type}-dismissed`

  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (sessionStorage.getItem(sessionKey)) {
      setVisible(false)
    } else {
      setVisible(true)
    }
  }, [sessionKey])

  if (!settings || !settings.enabled || !settings.text) return null
  if (!visible) return null

  const { tag, text, href } = settings

  function handleDismiss() {
    sessionStorage.setItem(sessionKey, '1')
    setVisible(false)
  }

  // 카카오 공유 액션 sentinel (admin.config.ts validatePromoHref / TopPromoBannerPanel과 동일 값)
  const isKakaoShare = href === 'kakao:share'

  async function handleShare() {
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
        title: '우리 나이가 어때서 — 우나어',
        description: '우리 또래끼리 모이는 따뜻한 커뮤니티, 같이 해요!',
        imageUrl: `${appUrl}/logo.png`,
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

  const isExternal = href.startsWith('https://')

  const linkContent = (
    <span className="text-white text-[17px] font-semibold leading-snug line-clamp-2 flex-1 min-w-0">
      {text}
    </span>
  )

  return (
    <div
      className="relative flex items-center justify-center gap-2 h-[56px] px-4 overflow-hidden text-center"
      style={{
        background: 'linear-gradient(90deg, var(--hero-1-from) 0%, var(--hero-1-mid) 50%, var(--hero-1-to) 100%)',
      }}
      role="banner"
      aria-label="프로모션 배너"
    >
      {tag && (
        <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/20 text-white text-caption font-semibold leading-none whitespace-nowrap">
          {tag}
        </span>
      )}

      {isKakaoShare ? (
        <button
          type="button"
          onClick={handleShare}
          className="no-underline hover:underline flex-1 min-w-0 flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer"
        >
          {linkContent}
        </button>
      ) : isExternal ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="no-underline hover:underline flex-1 min-w-0 flex items-center"
        >
          {linkContent}
        </a>
      ) : (
        <Link
          href={href}
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
