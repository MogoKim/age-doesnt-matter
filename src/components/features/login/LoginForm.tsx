'use client'

import Link from 'next/link'
import { kakaoSignIn } from '@/app/login/actions'
import { sendGtmEvent, getStoredUtm } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  async function handleKakaoClick() {
    sendGtmEvent('kakao_button_click', { from: 'login_page', ...getStoredUtm() })
    trackEvent('kakao_button_click', { from: 'login_page' })
    await kakaoSignIn(callbackUrl)
  }

  return (
    // 모바일: 전체 화면 세로 분할 / 데스크탑: 420px 카드
    <div className="
      w-full min-h-dvh flex flex-col
      md:min-h-0 md:w-[420px] md:rounded-2xl md:overflow-hidden md:shadow-[0_4px_24px_rgba(0,0,0,0.10)]
    ">
      <h1 className="sr-only">로그인</h1>

      {/* 상단: 브랜드 + 공감 카피 */}
      <div className="relative basis-1/2 shrink-0 grow-0 overflow-hidden px-[22px] py-[22px] flex flex-col justify-center bg-[#FFF5F2]">

        {/* Blob 1: 좌상단 장식 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            top: '-40%',
            left: '-20%',
            width: '320px',
            height: '320px',
            borderRadius: '9999px',
            background: 'radial-gradient(circle, rgba(255,111,97,0.4) 0%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />

        {/* Blob 2: 우하단 장식 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            bottom: '-30%',
            right: '-15%',
            width: '260px',
            height: '260px',
            borderRadius: '9999px',
            background: 'radial-gradient(circle, rgba(255,180,162,0.55) 0%, transparent 70%)',
            filter: 'blur(15px)',
          }}
        />

        {/* 실제 콘텐츠 — blob 위 */}
        <div className="relative z-10">
          {/* 소셜 프루프 배지 */}
          <div className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1.5 rounded-lg bg-primary/20 text-primary-text text-[15px] font-bold mb-9">
            <span>💬</span>
            <span>지금도 누군가 고민을 나누고 있어요</span>
          </div>

          {/* 메인 카피 */}
          <p className="text-[24px] font-extrabold leading-[1.4] tracking-tight text-foreground">
            엄마 말고,<br />아내 말고,<br />그냥 나로.
          </p>
          <p className="text-[17px] text-muted-foreground mt-2.5">
            내 이야기만 해도 되는 곳.
          </p>
        </div>
      </div>

      {/* 하단: 액션 영역 (흰색) */}
      <div className="bg-background px-6 pt-8 flex flex-col flex-1 md:flex-none md:pb-12">

        {/* 카카오 버튼 */}
        <button
          type="button"
          onClick={handleKakaoClick}
          className="flex items-center justify-center gap-2 w-full h-[56px] px-6 border-none rounded-xl font-bold text-base cursor-pointer transition-all hover:brightness-95 hover:-translate-y-0.5 active:translate-y-0"
          style={{
            background: '#FEE500',
            color: '#191919',
            boxShadow: '0 2px 8px rgba(254,229,0,0.35)',
          }}
        >
          <span className="text-[22px] shrink-0">💬</span>
          카카오톡으로 시작하기
        </button>

        {/* 불안 해소 체크리스트 */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[17px] text-muted-foreground">
          <span>✓ 닉네임만 공개</span>
          <span className="text-muted-foreground/40">|</span>
          <span>✓ 1초 가입 · 무료</span>
        </div>

        {/* 먼저 둘러볼게요 — 최하단 */}
        <div className="flex-1 flex items-end justify-center pb-10 md:flex-none md:mt-8 md:pb-0">
          <Link
            href="/"
            className="text-[17px] text-muted-foreground transition-colors hover:underline underline-offset-2"
          >
            먼저 둘러볼게요
          </Link>
        </div>

      </div>
    </div>
  )
}
