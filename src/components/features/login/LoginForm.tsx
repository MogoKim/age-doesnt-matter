'use client'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { kakaoSignIn } from '@/app/login/actions'
import { sendGtmEvent, getStoredUtm, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'

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

      {/* 하단 코랄 그라데이션 배경 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'linear-gradient(0deg, rgba(255,111,97,0.07) 0%, #fff 40%)' }}
      />

      <div className="relative z-10 flex flex-col flex-1">

        {/* 1. 좌상단 뒤로가기 */}
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 min-h-[52px] px-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-[22px] leading-none" aria-hidden="true">‹</span>
            <span className="text-[15px]">뒤로가기</span>
          </button>
        </div>

        {/* 2. 중앙 로고 + 헤드라인 + 서브카피 */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-10">
          <Image
            src="/logo.png"
            width={130}
            height={130}
            alt="우나어 로고"
            className="object-contain mb-3"
            priority
          />
          <p className="text-[25px] font-bold leading-[1.4] text-center">
            <span className="text-foreground">신중년 여성만을 위한</span>
            <br />
            <span className="text-[#FF6F61]">고민 상담소</span>
          </p>
          <p className="text-[15px] text-muted-foreground mt-4 text-center">
            지금 로그인하고
            <br />
            나의 고민을 나눠보세요
          </p>
        </div>

        {/* 3. 하단 카카오 CTA */}
        <div className="px-6 pb-[68px] md:pb-[60px]">
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
            <span className="text-[20px] shrink-0" aria-hidden="true">💬</span>
            카카오로 3초만에 시작하기
          </button>
        </div>

      </div>
    </div>
  )
}
