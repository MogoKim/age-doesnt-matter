'use client'

import Link from 'next/link'
import { kakaoSignIn } from '@/app/login/actions'
import { sendGtmEvent, getStoredUtm } from '@/lib/gtm'

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  async function handleKakaoClick() {
    sendGtmEvent('kakao_button_click', { from: 'login_page', ...getStoredUtm() })
    await kakaoSignIn(callbackUrl)
  }

  return (
    // 모바일: 전체 화면 세로 분할 / 데스크탑: 420px 카드
    <div className="
      w-full min-h-dvh flex flex-col
      md:min-h-0 md:w-[420px] md:rounded-2xl md:overflow-hidden md:shadow-[0_4px_24px_rgba(0,0,0,0.10)]
    ">
      <h1 className="sr-only">로그인</h1>

      {/* 상단: 브랜드 + 공감 카피 (primary/5 배경) */}
      <div
        className="px-7 flex flex-col justify-between py-10 md:py-12"
        style={{ background: 'rgba(255, 111, 97, 0.13)', flex: '0 0 44%' }}
      >
        {/* 소셜 프루프 뱃지 */}
        <div
          className="inline-flex items-center gap-2 w-fit px-3 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255, 111, 97, 0.18)', color: '#FF6F61' }}
        >
          <span>💬</span>
          <span>지금도 누군가 고민을 나누고 있어요</span>
        </div>

        {/* 메인 카피 */}
        <div>
          <p className="font-bold leading-[1.45]" style={{ fontSize: '30px', color: '#111', letterSpacing: '-0.02em' }}>
            엄마 말고,<br />아내 말고,<br />그냥 나로.
          </p>
          <p className="text-[17px] font-medium mt-3" style={{ color: '#888' }}>
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
        <div className="mt-4 flex items-center justify-center gap-4 text-sm" style={{ color: '#999' }}>
          <span>✓ 닉네임만 공개</span>
          <span style={{ color: '#ddd' }}>|</span>
          <span>✓ 10초 가입 · 무료</span>
        </div>

        {/* 먼저 둘러볼게요 — 최하단 */}
        <div className="flex-1 flex items-end justify-center pb-10 md:flex-none md:mt-8 md:pb-0">
          <Link
            href="/"
            className="text-sm transition-colors hover:underline underline-offset-2"
            style={{ color: '#bbb' }}
          >
            먼저 둘러볼게요
          </Link>
        </div>

      </div>
    </div>
  )
}
