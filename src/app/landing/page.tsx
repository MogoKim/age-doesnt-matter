import type { Metadata } from 'next'
import Link from 'next/link'
import { getLandingCafePosts } from '@/lib/queries/cafe-posts.landing'
import LandingClient from '@/components/features/landing/LandingClient'

const COPY: Record<string, { hook: string; sub: string }> = {
  relation: {
    hook: '혼자가 아니에요',
    sub: '나 같은 고민, 여기 다 있어요',
  },
  freedom: {
    hook: '남편이 집에 맨날 있어서요',
    sub: '못 꺼냈던 이야기, 여기선 다 해요',
  },
  health: {
    hook: '나만 이런 줄 알았어요',
    sub: '갱년기, 우리 또래는 어떻게 하나요',
  },
  money: {
    hook: '생활비가 조여들기 시작했어요',
    sub: '먼저 겪은 50대들이 알려드려요',
  },
}

export const metadata: Metadata = {
  title: '5060 여성 공감 커뮤니티 — 우리 나이가 어때서',
  description: '나 같은 고민, 여기 다 있어요. 50·60대 여성만의 따뜻한 공감 커뮤니티. 카카오로 10초 무료 가입.',
  robots: { index: false },
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const { t = 'relation' } = await searchParams
  const copy = COPY[t] ?? COPY.relation
  const posts = await getLandingCafePosts(t)

  return (
    <div className="min-h-dvh" style={{ background: '#f8f8f8' }}>

      {/* 상단 로고바 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <span className="text-[15px] font-bold" style={{ color: '#FF6F61' }}>
            우리 나이가 어때서
          </span>
          <Link
            href="/login?callbackUrl=/"
            className="text-[13px] font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: '#FFF0EE', color: '#FF6F61' }}
          >
            무료 가입
          </Link>
        </div>
      </header>

      {/* 히어로 */}
      <section className="max-w-lg mx-auto px-4 pt-8 pb-6">
        <p className="text-[28px] font-bold leading-tight mb-2" style={{ color: '#111', letterSpacing: '-0.02em' }}>
          {copy.hook}
        </p>
        <p className="text-[16px]" style={{ color: '#666' }}>
          {copy.sub}
        </p>
        <p className="text-[13px] mt-3 font-medium" style={{ color: '#FF6F61' }}>
          5060 여성 공감 커뮤니티
        </p>
      </section>

      {/* 구분선 */}
      <div className="max-w-lg mx-auto px-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: '#e8e8e8' }} />
          <span className="text-[12px] font-medium" style={{ color: '#aaa' }}>지금 나누고 있는 이야기</span>
          <div className="flex-1 h-px" style={{ background: '#e8e8e8' }} />
        </div>
      </div>

      {/* 카드 목록 + 스티키 CTA (클라이언트) */}
      <LandingClient posts={posts} t={t} />

    </div>
  )
}
