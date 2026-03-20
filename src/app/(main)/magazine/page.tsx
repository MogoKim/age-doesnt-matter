import Link from 'next/link'
import { getMagazineList } from '@/lib/queries/posts'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'

export default async function MagazinePage() {
  const { posts } = await getMagazineList({ limit: 20 })

  const featured = posts[0]
  const rest = posts.slice(1)

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6">
        <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          📖 매거진
        </h2>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
            <p className="text-base text-muted-foreground leading-relaxed">
              아직 매거진이 없어요. 곧 유익한 글이 올라올 거예요!
            </p>
          </div>
        ) : (
          <>
            {/* 최신 1건: 대형 카드 */}
            {featured && <FeaturedCard post={featured} />}

            {/* 나머지: 2열 그리드 */}
            {rest.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-4 lg:grid-cols-4">
                {rest.map((post) => (
                  <MagazineCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FeaturedCard({ post }: { post: PostSummary }) {
  return (
    <Link
      href={`/magazine/${post.id}`}
      className="block bg-card rounded-2xl border border-border overflow-hidden no-underline transition-all hover:border-primary/30 hover:shadow-md"
    >
      {post.thumbnailUrl ? (
        <div className="w-full h-48 bg-muted flex items-center justify-center text-4xl lg:h-64">
          📖
        </div>
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-4xl lg:h-64">
          📖
        </div>
      )}
      <div className="p-4">
        {post.category && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[13px] font-bold mb-2">
            {post.category}
          </span>
        )}
        <h3 className="text-lg font-bold text-foreground m-0 mb-2 line-clamp-2">{post.title}</h3>
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <span>👁 {post.viewCount}</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
        </div>
      </div>
    </Link>
  )
}

function MagazineCard({ post }: { post: PostSummary }) {
  return (
    <Link
      href={`/magazine/${post.id}`}
      className="block bg-card rounded-xl border border-border overflow-hidden no-underline transition-all hover:border-primary/30"
    >
      <div className="w-full h-28 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-2xl lg:h-36">
        📖
      </div>
      <div className="p-3">
        {post.category && (
          <span className="text-[11px] text-primary font-bold">{post.category}</span>
        )}
        <h3 className="text-sm font-bold text-foreground m-0 line-clamp-2 leading-snug">
          {post.title}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1 m-0">
          👁 {post.viewCount} · {formatTimeAgo(post.createdAt)}
        </p>
      </div>
    </Link>
  )
}
