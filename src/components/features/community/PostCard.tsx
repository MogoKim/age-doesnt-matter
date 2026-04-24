import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from './utils'
import { IconHeart, IconComment, IconEye } from '@/components/icons'

interface PostCardProps {
  post: PostSummary
  boardSlug: string
}

export default function PostCard({ post, boardSlug }: PostCardProps) {
  return (
    <Link
      href={`/community/${boardSlug}/${post.id}`}
      className="bg-card rounded-2xl p-6 border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 flex flex-col gap-2.5 no-underline text-inherit relative overflow-hidden after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-primary after:scale-x-0 after:transition-transform after:duration-300 hover:after:scale-x-100 lg:p-5 lg:hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] lg:hover:-translate-y-[3px] lg:hover:border-primary/20"
    >
      {post.category && (
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-caption font-bold w-fit tracking-wide">{post.category}</span>
      )}

      <h2 className="text-body font-bold text-foreground m-0 line-clamp-2 leading-[1.5]">
        {post.isPinned && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-bold tracking-wide mr-1 bg-foreground text-background">공지 </span>
        )}
        {post.promotionLevel === 'HOT' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-bold tracking-wide mr-1 bg-gradient-to-br from-[var(--gradient-hot-from)] to-[var(--gradient-hot-to)] text-white">HOT </span>
        )}
        {post.promotionLevel === 'HALL_OF_FAME' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-bold tracking-wide mr-1 bg-gradient-to-br from-[var(--gradient-fame-from)] to-[var(--gradient-fame-to)] text-white">FAME </span>
        )}
        {post.title}
      </h2>

      <p className="text-caption text-muted-foreground m-0 line-clamp-2 leading-relaxed">{post.preview}</p>

      <div className="flex items-center gap-1.5 text-caption text-muted-foreground pt-1">
        <span>{post.author.gradeEmoji}</span>
        <span className="font-medium text-muted-foreground">{post.author.nickname}</span>
        <span className="text-border">·</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>

      <div className="flex items-center gap-4 text-caption text-muted-foreground pt-1.5 border-t border-[#f0eeec] mt-0.5">
        <span className="flex items-center gap-1.5" aria-label={`좋아요 ${post.likeCount}개`}>
          <IconHeart size={16} /> {post.likeCount}
        </span>
        <span className="flex items-center gap-1.5" aria-label={`댓글 ${post.commentCount}개`}>
          <IconComment size={16} /> {post.commentCount}
        </span>
        <span className="flex items-center gap-1.5" aria-label={`조회 ${post.viewCount}회`}>
          <IconEye size={16} /> {post.viewCount}
        </span>
      </div>
    </Link>
  )
}
