import HomeCardLink from '@/components/features/home/HomeCardLink'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'
import { IconComment, IconEye } from '@/components/icons'
import { getCategoryChipClass } from '@/lib/category-chip'

interface Props {
  posts: PostSummary[]
}

export default function TrendingSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--icon-best-bg)] text-xl">🔥</span>
          지금 뜨는 이야기
        </h2>
        <HomeCardLink href="/best" className="text-[17px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary-text" section="trending" position={-1} contentId="" action="more">
          더보기 →
        </HomeCardLink>
      </div>
      <ol className="list-none m-0 px-4 lg:px-0 lg:grid lg:grid-cols-2 lg:gap-x-8">
        {posts.map((post, index) => (
          <li
            key={post.id}
            className="group lg:border-b lg:border-border/60 lg:last:border-b-0 motion-safe:transition-[border-color] motion-safe:duration-[250ms] motion-reduce:transition-none [@media(hover:hover)]:hover:border-primary active:border-primary"
          >
            <HomeCardLink
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              className="group flex items-start gap-3 py-3.5 border-b border-border/60 no-underline text-inherit min-h-[52px] motion-safe:transition-[border-color] motion-safe:duration-[250ms] motion-reduce:transition-none [@media(hover:hover)]:hover:border-primary active:border-primary lg:border-b-0"
              section="trending"
              position={index}
              contentId={post.id}
            >
              <span className="text-[28px] font-black italic text-primary-text min-w-[32px] text-center shrink-0 leading-none">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep motion-safe:transition-colors motion-safe:duration-[250ms] motion-reduce:transition-none [@media(hover:hover)]:group-hover:text-primary-text group-active:text-primary-text">{post.title}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 text-caption font-bold leading-[1.4] ${getCategoryChipClass(post.boardType)}`}>{BOARD_DISPLAY_NAMES[post.boardType] ?? post.boardType}</span>
                  <span className="flex items-center gap-1"><IconComment size={15} /> {post.commentCount}</span>
                  <span className="flex items-center gap-1"><IconEye size={15} /> {post.viewCount}</span>
                </div>
              </div>
            </HomeCardLink>
          </li>
        ))}
      </ol>
    </section>
  )
}
