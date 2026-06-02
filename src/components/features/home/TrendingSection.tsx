import HomeCardLink from '@/components/features/home/HomeCardLink'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'
import { IconComment, IconHeart } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

export default function TrendingSection({ posts }: Props) {
  if (posts.length === 0) return null

  return (
    <section className="py-4 border-b-4 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">🔥</span>
          지금 뜨는 이야기
        </h2>
        <HomeCardLink href="/best" className="text-[17px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[52px] min-w-[52px] hover:text-primary-text" section="trending" position={-1} contentId="" action="more">
          더보기 →
        </HomeCardLink>
      </div>
      {/* 모바일: 1열 / 데스크탑: 2열 그리드 */}
      <ol className="list-none m-0 px-4 lg:px-0 lg:grid lg:grid-cols-2 lg:gap-x-8">
        {posts.map((post, index) => (
          <li key={post.id} className="lg:border-b lg:border-border lg:last:border-b-0">
            <HomeCardLink
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}?from=trending`}
              className="relative overflow-hidden group flex items-start gap-3 py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:border-b-0 lg:active:mx-0 lg:active:px-0 after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:opacity-0 after:bg-[linear-gradient(90deg,rgba(255,111,97,0.10),rgba(255,111,97,0.02))] motion-safe:after:transition-opacity motion-safe:after:duration-300 motion-reduce:after:transition-none hover:after:opacity-100"
              section="trending"
              position={index}
              contentId={post.id}
            >
              <span className="relative z-[1] text-body font-bold text-primary-text min-w-[32px] text-center shrink-0 leading-[1.4] motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:scale-110">{index + 1}</span>
              <div className="relative z-[1] flex-1 min-w-0 pr-8">
                <p className="text-body font-bold text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep group-hover:text-primary-text motion-safe:transition-colors motion-safe:duration-200">{post.title}</p>
                <div className="flex items-center gap-2.5 text-caption text-muted-foreground">
                  <span className="flex items-center gap-1"><IconComment size={15} /> {post.commentCount}</span>
                  <span className="flex items-center gap-1"><IconHeart size={15} /> {post.likeCount}</span>
                  <span className="bg-background px-2 py-0.5 rounded text-caption text-muted-foreground">{BOARD_DISPLAY_NAMES[post.boardType] ?? post.boardType}</span>
                </div>
              </div>
              <span aria-hidden="true" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary-text opacity-0 -translate-x-[6px] group-hover:opacity-100 group-hover:translate-x-0 motion-safe:transition-all motion-safe:duration-200">→</span>
            </HomeCardLink>
          </li>
        ))}
      </ol>
    </section>
  )
}
