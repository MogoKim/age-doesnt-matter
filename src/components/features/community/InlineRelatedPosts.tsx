import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import TrackedPostLink from './TrackedPostLink'

interface Props {
  posts: PostSummary[]
  boardSlug: string
}

/** 본문 직후 "같은 고민 글" 카드 (네이버 유입자 락인 ②). 빈 배열이면 미렌더. */
export default function InlineRelatedPosts({ posts, boardSlug }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="my-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <h2 className="text-body font-bold text-primary-text m-0 mb-2">
        💬 이 글과 비슷한 고민, 또래들 이야기예요
      </h2>
      <ol className="list-none m-0 p-0">
        {posts.map((post, idx) => (
          <li key={post.id} className="border-t border-primary/10 first:border-t-0">
            <TrackedPostLink
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              postId={post.id}
              position="inline"
              boardSlug={boardSlug}
              className="flex items-center gap-2.5 py-3 no-underline text-inherit min-h-[52px] hover:bg-primary/5 transition-colors -mx-2 px-2 rounded-lg"
            >
              <span className="text-body font-bold text-primary shrink-0">{idx + 1}</span>
              <span className="text-body font-medium text-foreground line-clamp-2 leading-[1.5]">
                {post.title}
              </span>
            </TrackedPostLink>
          </li>
        ))}
      </ol>
    </section>
  )
}
