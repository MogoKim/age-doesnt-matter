import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from './utils'

interface PostCardProps {
  post: PostSummary
  boardSlug: string
}

export default function PostCard({ post, boardSlug }: PostCardProps) {
  return (
    <Link
      href={`/community/${boardSlug}/${post.id}`}
      className="bg-card rounded-2xl p-6 border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-[250ms] flex flex-col gap-2.5 no-underline text-inherit relative overflow-hidden after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-primary after:scale-x-0 after:transition-transform after:duration-300 hover:after:scale-x-100 lg:p-5 lg:hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] lg:hover:-translate-y-[3px] lg:hover:border-primary/20"
    >
      {post.category && (
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-bold w-fit tracking-wide">{post.category}</span>
      )}

      <h3 className="text-sm font-bold text-foreground m-0 line-clamp-2 leading-[1.5]">
        {post.promotionLevel === 'HOT' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wide mr-1 bg-gradient-to-br from-[#FF6B6B] to-[#FF8E53] text-white">HOT </span>
        )}
        {post.promotionLevel === 'FAME' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wide mr-1 bg-gradient-to-br from-[#A855F7] to-[#EC4899] text-white">FAME </span>
        )}
        {post.title}
      </h3>

      <p className="text-[15px] text-muted-foreground m-0 line-clamp-2 leading-relaxed">{post.preview}</p>

      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground pt-1">
        <span>{post.author.gradeEmoji}</span>
        <span className="font-medium text-muted-foreground">{post.author.nickname}</span>
        <span className="text-border">·</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>

      <div className="flex items-center gap-4 text-[13px] text-muted-foreground pt-1.5 border-t border-[#f0eeec] mt-0.5">
        <span className="flex items-center gap-1">
          ❤️ {post.likeCount}
        </span>
        <span className="flex items-center gap-1">
          💬 {post.commentCount}
        </span>
        <span className="flex items-center gap-1">
          👁 {post.viewCount}
        </span>
      </div>
    </Link>
  )
}
