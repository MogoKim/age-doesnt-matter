'use client'

import Link from 'next/link'
import { trackEvent } from '@/lib/track'
import { sendGtmEvent } from '@/lib/gtm'

interface MagazineExploreLinksProps {
  postId: string
  postTitle: string
}

// 'community' = 대표 배너 CTA(보조 'stories'와 분석 구분), 나머지는 보조 링크 4개
type ExploreTarget = 'community' | 'home' | 'stories' | 'life2' | 'best'

const SUB_LINKS: { target: ExploreTarget; href: string; icon: string; label: string }[] = [
  { target: 'home', href: '/', icon: '🏠', label: '홈' },
  { target: 'stories', href: '/community/stories', icon: '💬', label: '커뮤니티' },
  { target: 'life2', href: '/community/life2', icon: '🌱', label: '인생 2막' },
  { target: 'best', href: '/best', icon: '🔥', label: '인기 글' },
]

/**
 * 매거진 상세 락인 동선 — 외부 검색 유입자가 우나어를 모르는 상태에서도
 * 타겟·가치를 즉시 이해하고 사이트로 이동하도록, 대표 배너 + 보조 링크 4개를 제공한다.
 * (매거진 전용)
 */
export default function MagazineExploreLinks({ postId, postTitle }: MagazineExploreLinksProps) {
  function handleClick(target: ExploreTarget) {
    const props = { post_id: postId, post_title: postTitle, target }
    trackEvent('magazine_explore_click', props)
    sendGtmEvent('magazine_explore_click', props)
  }

  return (
    <nav className="mb-8" aria-label="우나어 소개">
      {/* 우나어 소개 카드 — 가입 유도가 아니라 서비스 소개. 연한 테두리 중심, outline CTA */}
      <div className="rounded-2xl border border-primary/20 bg-card p-5 mb-3">
        <p className="text-lg font-bold text-foreground leading-snug break-keep">
          우나어는 40·50·60대 여성 커뮤니티예요
        </p>
        <p className="text-[15px] text-muted-foreground mt-1 mb-4 leading-snug break-keep">
          건강·가족·노후·일상 이야기를 편하게 나누는 곳이에요
        </p>
        <Link
          href="/community/stories"
          onClick={() => handleClick('community')}
          className="inline-flex items-center gap-1.5 min-h-[52px] px-6 rounded-full border-2 border-primary bg-transparent text-primary-text font-bold text-body no-underline transition-colors hover:bg-primary/5"
        >
          우나어 둘러보기 →
        </Link>
      </div>

      {/* 보조 링크 4개 */}
      <div className="grid grid-cols-4 gap-2">
        {SUB_LINKS.map(({ target, href, icon, label }) => (
          <Link
            key={target}
            href={href}
            onClick={() => handleClick(target)}
            className="flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 rounded-xl border border-border bg-card no-underline text-foreground text-caption font-bold transition-colors hover:border-primary/30"
          >
            <span className="text-lg" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
