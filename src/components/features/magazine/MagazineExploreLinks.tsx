'use client'

import Link from 'next/link'
import { trackEvent } from '@/lib/track'
import { sendGtmEvent } from '@/lib/gtm'

interface MagazineExploreLinksProps {
  postId: string
  postTitle: string
}

type ExploreTarget = 'home' | 'stories' | 'life2' | 'best'

const LINKS: { target: ExploreTarget; href: string; icon: string; label: string; desc: string }[] = [
  { target: 'home', href: '/', icon: '🏠', label: '우나어 홈', desc: '오늘 인기 글' },
  { target: 'stories', href: '/community/stories', icon: '💬', label: '사는 이야기', desc: '우리 또래 이야기' },
  { target: 'life2', href: '/community/life2', icon: '🌱', label: '2막 준비', desc: '인생 2막 준비' },
  { target: 'best', href: '/best', icon: '🔥', label: '인기 글', desc: '많이 보는 글' },
]

/**
 * 매거진 상세 락인 동선 — 검색 유입자가 매거진 1편만 보고 나가지 않도록
 * 홈/사는이야기/2막준비/베스트로 이동할 입구를 제공한다. (매거진 전용)
 */
export default function MagazineExploreLinks({ postId, postTitle }: MagazineExploreLinksProps) {
  function handleClick(target: ExploreTarget) {
    const props = { post_id: postId, post_title: postTitle, target }
    trackEvent('magazine_explore_click', props)
    sendGtmEvent('magazine_explore_click', props)
  }

  return (
    <nav className="mb-8" aria-label="우나어 더 둘러보기">
      <h3 className="text-body font-bold text-foreground mb-4">우나어 더 둘러보기</h3>
      <div className="grid grid-cols-2 gap-3">
        {LINKS.map(({ target, href, icon, label, desc }) => (
          <Link
            key={target}
            href={href}
            onClick={() => handleClick(target)}
            className="flex items-center gap-3 p-4 min-h-[52px] bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30 hover:shadow-sm"
          >
            <span className="text-2xl flex-shrink-0" aria-hidden="true">{icon}</span>
            <span className="flex flex-col min-w-0">
              <span className="text-body font-bold text-foreground leading-tight">{label}</span>
              <span className="text-caption text-muted-foreground leading-snug mt-0.5 line-clamp-1">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
