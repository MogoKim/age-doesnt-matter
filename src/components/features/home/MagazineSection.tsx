import Link from 'next/link'
import Image from 'next/image'
import type { PostSummary } from '@/types/api'
import { getCategoryEmoji } from '@/lib/format'

interface Props {
  posts: PostSummary[]
}

export default function MagazineSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">📖</span>
          매거진
        </h2>
        <Link href="/magazine" className="text-caption text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          전체보기 →
        </Link>
      </div>
      {/* 모바일: 가로 스크롤 1열 / 데스크탑: 4열 그리드 */}
      <div className="flex gap-3 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-snap-type:x_mandatory] lg:grid lg:grid-cols-4 lg:gap-4 lg:px-0 lg:overflow-x-visible lg:[scroll-snap-type:none]">
        {posts.map((article) => (
          <Link
            href={`/magazine/${article.id}`}
            key={article.id}
            className="shrink-0 w-[200px] lg:w-auto bg-card rounded-xl overflow-hidden border border-border no-underline text-inherit block active:opacity-95 [scroll-snap-align:start] lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div className="relative w-full h-[120px] lg:h-[140px] bg-background">
              {article.thumbnailUrl ? (
                <Image
                  src={article.thumbnailUrl}
                  alt={article.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 200px, 25vw"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-3xl">
                  {getCategoryEmoji(article.category)}
                </div>
              )}
            </div>
            <div className="p-3">
              <span className="text-caption text-primary-text font-semibold mb-1 block">{article.category}</span>
              <h3 className="text-caption font-bold text-foreground leading-[1.4] line-clamp-2 break-keep">{article.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
