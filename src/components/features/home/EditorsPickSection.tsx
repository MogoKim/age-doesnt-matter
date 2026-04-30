import Link from 'next/link'
import Image from 'next/image'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { getCategoryEmoji } from '@/lib/format'

interface Props {
  posts: PostSummary[]
}

export default function EditorsPickSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">⭐</span>
          이달의 인기글
        </h2>
        <Link href="/best" className="text-caption text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          더보기 →
        </Link>
      </div>
      <div className="relative">
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pr-12 flex gap-3 lg:overflow-x-visible lg:[scroll-snap-type:none] lg:px-0 lg:pr-0 lg:grid lg:grid-cols-2 lg:gap-4">
          {posts.map((post, index) => (
            <Link
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.id}`}
              key={post.id}
              className="shrink-0 w-[200px] lg:w-auto bg-card rounded-xl overflow-hidden border border-border [scroll-snap-align:start] lg:[scroll-snap-align:none] no-underline text-inherit block active:opacity-95 lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
            >
              <div className="relative w-full h-[120px] lg:h-40 bg-background">
                {post.thumbnailUrl ? (
                  <Image
                    src={post.thumbnailUrl}
                    alt={post.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 200px, 50vw"
                    priority={index === 0}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-4xl">
                    {getCategoryEmoji(post.category)}
                  </div>
                )}
              </div>
              <div className="p-3 lg:p-4">
                <span className="inline-flex items-center gap-1 h-6 px-2.5 bg-[var(--badge-editors)] text-white rounded-md text-caption font-bold mb-2">이달의 인기</span>
                <h3 className="text-body font-bold text-foreground leading-[1.5] break-keep line-clamp-2 mb-2">{post.title}</h3>
                <div className="flex items-center gap-3 text-caption text-muted-foreground">
                  <span>❤️ {post.likeCount}</span>
                  <span>💬 {post.commentCount}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {/* 스크롤 힌트 — 우측 페이드 그래디언트 (모바일만) */}
        <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
      </div>
    </section>
  )
}
