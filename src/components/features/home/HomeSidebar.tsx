import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { IconStories } from '@/components/icons'

interface Props {
  posts: PostSummary[]
}

export default function HomeSidebar({ posts }: Props) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-[92px]">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h3 className="text-base font-bold text-foreground mb-3 pb-2.5 border-b border-border flex items-center gap-2"><span className="text-primary"><IconStories size={18} /></span> 최신 소통글</h3>
        <ul className="list-none m-0 p-0">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.id}`}
                className="block py-2.5 border-b border-border last:border-b-0 text-[0.88rem] text-foreground leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis no-underline hover:text-primary"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-[var(--surface-warm)] rounded-xl p-4 border border-border relative min-h-[250px] flex items-center justify-center text-muted-foreground text-sm" role="complementary" aria-label="광고 영역">
        <span className="absolute top-2 right-3 text-[0.88rem] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border">광고</span>
        광고 영역
      </div>
    </aside>
  )
}
