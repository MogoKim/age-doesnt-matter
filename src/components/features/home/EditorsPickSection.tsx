import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'

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
          에디터스 픽
        </h2>
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
        {posts.map((post) => (
          <Link
            href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.id}`}
            key={post.id}
            className="mx-4 lg:mx-0 bg-card rounded-xl overflow-hidden border border-border no-underline text-inherit block mb-3 last:mb-0 lg:mb-0 active:opacity-95 lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div
              className="w-full h-40 bg-background"
              role="img"
              aria-label={post.title}
            />
            <div className="p-4">
              <span className="inline-flex items-center gap-1 h-6 px-2.5 bg-[var(--badge-editors)] text-white rounded-md text-caption font-bold mb-2.5">PO 추천</span>
              <h3 className="text-body font-bold text-foreground leading-[1.5] mb-2 break-keep line-clamp-2">{post.title}</h3>
              <p className="text-caption text-muted-foreground leading-relaxed mb-3 line-clamp-2">{post.preview}</p>
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <span>❤️ {post.likeCount}</span>
                <span>💬 {post.commentCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
