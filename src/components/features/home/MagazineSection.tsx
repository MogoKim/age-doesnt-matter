import Link from 'next/link'
import type { PostSummary } from '@/types/api'

interface Props {
  posts: PostSummary[]
}

export default function MagazineSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-6 border-b-8 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">📖</span>
          매거진
        </h2>
        <Link href="/magazine" className="text-[15px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary">
          전체보기 →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:gap-4 lg:px-0">
        {posts.map((article) => (
          <Link
            href={`/magazine/${article.id}`}
            key={article.id}
            className="bg-card rounded-xl overflow-hidden border border-border no-underline text-inherit block active:opacity-95 lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div
              className="w-full h-[100px] lg:h-[140px] bg-background"
              role="img"
              aria-label={article.title}
            />
            <div className="p-3">
              <span className="text-xs text-primary font-semibold mb-1 block">{article.category}</span>
              <h3 className="text-[15px] font-bold text-foreground leading-[1.4] line-clamp-2 break-keep">{article.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
