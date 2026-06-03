'use client'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { kakaoSignIn } from '@/app/login/actions'
import { sendGtmEvent, getStoredUtm, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { IconKakao } from '@/components/icons'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'

  async function handleKakaoClick() {
    sendGtmEvent('kakao_button_click', { from: 'login_page', browser_env: getBrowserEnv(), ...getStoredUtm() })
    trackEvent('kakao_button_click', { from: 'login_page', browser_env: getBrowserEnv() })
    await kakaoSignIn(callbackUrl)
  }

  return (
    <div className="relative w-full min-h-dvh flex flex-col overflow-hidden bg-background md:min-h-0 md:w-[420px] md:rounded-2xl md:shadow-[0_4px_24px_rgba(0,0,0,0.10)]">
      <h1 className="sr-only">로그인</h1>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'linear-gradient(0deg, rgba(255,111,97,0.06) 0%, #fff 38%)' }}
      />

      <div className="relative z-10 flex flex-col flex-1">

        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex min-h-[52px] items-center gap-2 px-2 text-foreground transition-colors hover:text-primary-text"
          >
            <span className="text-[26px] leading-none" aria-hidden="true">‹</span>
            <span className="text-[18px] font-bold">뒤로가기</span>
          </button>
        </div>

        <div className="my-auto flex flex-col items-center gap-[22px] px-8 py-8">
          <Image
            src="/logo.png"
            width={108}
            height={108}
            alt="우나어 로고"
            className="object-contain"
            priority
          />
          <p className="text-[30px] font-bold leading-[1.4] text-center">
            <span className="text-foreground">신중년 여성을 위한</span>
            <br />
            <span className="text-[#FF6F61]">고민 상담소</span>
          </p>
          <p className="text-[18px] text-muted-foreground text-center">
            지금 로그인하고 나의 고민을 나눠보세요
          </p>
        </div>

        <div className="mt-auto px-6 pb-[68px] md:pb-[60px]">
          <button
            type="button"
            onClick={handleKakaoClick}
            className="flex items-center justify-center gap-2 w-full h-[54px] rounded-xl font-bold cursor-pointer transition-all hover:brightness-95 hover:-translate-y-0.5 active:translate-y-0"
            style={{
              background: '#FEE500',
              color: '#191919',
              boxShadow: '0 2px 8px rgba(254,229,0,0.35)',
            }}
          >
            <IconKakao size={22} />
            카카오로 3초만에 시작하기
          </button>
        </div>

      </div>
    </div>
  )
}
