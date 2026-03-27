import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { IconStories } from '@/components/icons'
import AdSenseUnit from '@/components/ad/AdSenseUnit'

interface Props {
  posts: PostSummary[]
}

export default function HomeSidebar({ posts }: Props) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-[92px]">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h3 className="text-body font-bold text-foreground mb-3 pb-2.5 border-b border-border flex items-center gap-2"><span className="text-primary"><IconStories size={18} /></span> 최신 소통글</h3>
        <ul className="list-none m-0 p-0">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.id}`}
                className="block py-2.5 border-b border-border last:border-b-0 text-caption text-foreground leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis no-underline hover:text-primary"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <AdSenseUnit slotId="auto" format="rectangle" className="rounded-xl overflow-hidden min-h-[250px]" />
    </aside>
  )
}
