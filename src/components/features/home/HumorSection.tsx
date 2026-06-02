import HomeCardLink from '@/components/features/home/HomeCardLink'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { formatTimeAgo } from '@/components/features/community/utils'
import { IconComment, IconHeart, IconEnergy } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

export default function HumorSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-6 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="text-[var(--icon-laugh-stroke)]"><IconEnergy size={22} /></span>
          웃음방
        </h2>
        <HomeCardLink
          href="/community/humor"
          className="text-[17px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary-text"
          section="humor-hot"
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
              className="relative overflow-hidden group block py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:active:mx-0 lg:active:px-0 after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:opacity-0 after:bg-[linear-gradient(90deg,rgba(255,111,97,0.10),rgba(255,111,97,0.02))] motion-safe:after:transition-opacity motion-safe:after:duration-300 motion-reduce:after:transition-none hover:after:opacity-100"
              section="humor-hot"
              position={index}
              contentId={post.id}
            >
              <div className="relative z-[1] pr-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-caption text-muted-foreground">{post.author.nickname}</span>
                </div>
                <p className="text-body font-light text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep group-hover:text-primary-text motion-safe:transition-colors motion-safe:duration-200">{post.title}</p>
                <div className="flex items-center gap-2.5 text-caption text-muted-foreground">
                  <span className="flex items-center gap-1"><IconComment size={15} /> {post.commentCount}</span>
                  <span className="flex items-center gap-1"><IconHeart size={15} /> {post.likeCount}</span>
                  <span>{formatTimeAgo(post.createdAt)}</span>
                </div>
              </div>
              <span aria-hidden="true" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary-text opacity-0 -translate-x-[6px] group-hover:opacity-100 group-hover:translate-x-0 motion-safe:transition-all motion-safe:duration-200">→</span>
            </HomeCardLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
