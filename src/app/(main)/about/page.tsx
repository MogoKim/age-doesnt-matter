import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '우나어 소개',
  description: '우리 나이가 어때서 — 50·60대를 위한 따뜻한 커뮤니티',
  alternates: { canonical: 'https://age-doesnt-matter.com/about' },
}

export default function AboutPage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-8 leading-tight">
        우리 나이가 어때서
      </h1>

      <section className="mb-10">
        <p className="text-body text-foreground leading-[1.85] break-keep mb-4">
          <strong>우나어</strong>는 50·60대를 위한 따뜻한 커뮤니티입니다.
        </p>
        <p className="text-body text-foreground leading-[1.85] break-keep mb-4">
          나이는 숫자일 뿐, 지금이 가장 좋은 때입니다. 우나어에서는 같은 세대의 이야기를 나누고,
          새로운 일자리를 찾고, 유용한 정보를 얻을 수 있어요.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-foreground mb-4">우나어에서 할 수 있는 것</h2>
        <div className="space-y-4">
          <FeatureCard
            emoji="💼"
            title="내 일 찾기"
            description="50·60대 맞춤 일자리를 쉽게 찾아보세요. 나이 무관, 초보 환영 일자리를 큐레이션해 드려요."
          />
          <FeatureCard
            emoji="💬"
            title="소통 마당"
            description="일상 이야기, 건강 정보, 유머까지. 비슷한 세대와 따뜻한 수다를 나눠보세요."
          />
          <FeatureCard
            emoji="📖"
            title="매거진"
            description="기초연금, 건강, 생활 꿀팁 등 실생활에 도움되는 알짜 정보를 전해드려요."
          />
          <FeatureCard
            emoji="⭐"
            title="베스트"
            description="가장 많은 공감을 받은 인기 글들을 모아볼 수 있어요."
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold text-foreground mb-4">함께해요</h2>
        <p className="text-body text-foreground leading-[1.85] break-keep mb-6">
          카카오 계정 하나면 바로 시작할 수 있어요. 어렵지 않아요!
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center w-full h-[52px] bg-primary text-white rounded-xl text-body font-bold no-underline transition-colors hover:bg-[#E85D50] lg:w-auto lg:h-12 lg:px-8"
        >
          카카오로 시작하기
        </Link>
      </section>

      <section className="pt-6 border-t border-border">
        <p className="text-sm text-muted-foreground leading-relaxed">
          문의사항이 있으시면{' '}
          <Link href="/contact" className="text-primary no-underline font-medium">
            문의 페이지
          </Link>
          를 이용해 주세요.
        </p>
      </section>
    </div>
  )
}

function FeatureCard({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className="flex gap-4 p-4 bg-card rounded-xl border border-border">
      <span className="text-2xl shrink-0">{emoji}</span>
      <div>
        <h3 className="text-body font-bold text-foreground m-0 mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground m-0 leading-relaxed break-keep">{description}</p>
      </div>
    </div>
  )
}
