import HomeCardLink from '@/components/features/home/HomeCardLink'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'
import { formatTimeAgo } from '@/components/features/community/utils'
import { IconComment, IconStories } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

export default function StoriesSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-6 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="text-[var(--icon-life-stroke)]"><IconStories size={22} /></span>
          사는 이야기
        </h2>
        <HomeCardLink
          href="/community/stories"
          className="text-[17px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary-text"
          section="stories-hot"
          position={-1}
          contentId=""
          action="more"
        >
          더보기 →
        </HomeCardLink>
      </div>
      <ul className="list-none m-0 px-4 lg:px-0">
        {posts.map((post, index) => (
          <li key={post.id}>
            <HomeCardLink
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              className="relative overflow-hidden group block py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:active:mx-0 lg:active:px-0 after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:opacity-0 after:bg-[linear-gradient(90deg,rgba(255,111,97,0.10),rgba(255,111,97,0.02))] motion-safe:after:transition-opacity motion-safe:after:duration-300 motion-safe:after:ease-out motion-reduce:after:transition-none [@media(hover:hover)]:hover:after:opacity-100"
              section="stories-hot"
              position={index}
              contentId={post.id}
            >
              <div className="relative z-[1]">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold leading-[1.4] text-primary-text motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:[@media(hover:hover)]:group-hover:scale-[1.05]">
                    {BOARD_DISPLAY_NAMES[post.boardType] ?? post.boardType}
                  </span>
                  <span aria-hidden="true" className="shrink-0 pointer-events-none text-primary-text opacity-0 -translate-x-[6px] motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out motion-reduce:translate-x-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:translate-x-0">→</span>
                </div>
                <p className="text-body font-medium text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep motion-safe:transition-colors motion-safe:duration-300 [@media(hover:hover)]:group-hover:text-primary-text">{post.title}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-muted-foreground">
                  <span>{post.author.nickname}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1"><IconComment size={15} /> {post.commentCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimeAgo(post.createdAt)}</span>
                </div>
              </div>
            </HomeCardLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
