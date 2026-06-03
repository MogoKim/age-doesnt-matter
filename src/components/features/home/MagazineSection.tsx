import Image from 'next/image'
import HomeCardLink from '@/components/features/home/HomeCardLink'
import type { PostSummary } from '@/types/api'
import { getCategoryEmoji } from '@/lib/format'
import { getCategoryChipClass } from '@/lib/category-chip'
import { IconMagazine } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

export default function MagazineSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--icon-magazine-bg)] text-[var(--icon-magazine-stroke)]"><IconMagazine size={22} /></span>
          매거진
        </h2>
        <HomeCardLink href="/magazine" className="text-[17px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary-text" section="magazine" position={-1} contentId="" action="more">
          전체보기 →
        </HomeCardLink>
      </div>
      {/* 모바일: 가로 스크롤 1열 / 데스크탑: 4열 그리드 */}
      <div className="relative">
        <div className="flex gap-3 px-4 pr-12 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-snap-type:x_mandatory] lg:grid lg:grid-cols-4 lg:gap-4 lg:px-0 lg:pr-0 lg:overflow-x-visible lg:[scroll-snap-type:none]">
          {posts.map((article, index) => (
            <HomeCardLink
              href={`/magazine/${article.slug ?? article.id}`}
              key={article.id}
              className="shrink-0 w-[200px] lg:w-auto bg-card rounded-xl overflow-hidden border border-border no-underline text-inherit block active:opacity-95 [scroll-snap-align:start] lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
              section="magazine"
              position={index}
              contentId={article.id}
            >
              <div className="relative w-full h-[120px] lg:h-[140px] bg-background">
                {article.thumbnailUrl ? (
                  <Image
                    src={article.thumbnailUrl}
                    alt={article.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 200px, 25vw"
                    priority={index === 0}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-3xl">
                    {getCategoryEmoji(article.category)}
                  </div>
                )}
              </div>
              <div className="p-3">
                <span className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-caption font-bold mb-2 ${getCategoryChipClass(article.boardType)}`}>{article.category}</span>
                <h3 className="text-body font-bold text-foreground leading-[1.4] line-clamp-2 break-keep">{article.title}</h3>
              </div>
            </HomeCardLink>
          ))}
        </div>
        <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
      </div>
    </section>
  )
}
