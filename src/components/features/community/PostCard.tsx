import { memo } from 'react'
import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from './utils'
import { IconHeart, IconComment, IconEye } from '@/components/icons'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'
import CategoryBadge from '@/components/ui/CategoryBadge'
import type { BoardType } from '@/generated/prisma/client'

interface PostCardProps {
  post: PostSummary
  boardSlug: string
  showBoardBadge?: boolean
}

/**
 * 게시글 목록 한 줄(리스트 행).
 *
 * 카드가 아니라 구분선으로 나뉜 행이다. 카드형이던 시절 배지가 제목 위에 있어
 * 첫 시선이 제목으로 가지 않았고, 카드 하나가 191px이라 12개 목록이 3000px였다.
 * 제목을 맨 위로 올리고 라운드·그림자·4면 테두리를 걷어냈다.
 *
 * 좌우 padding을 두지 않는다 — 소비처 4곳의 상위 컨테이너가 이미 px-4(md:px-6)를
 * 가지고 있어, 여기서 또 주면 본문이 안쪽으로 한 번 더 밀린다.
 *
 * preview는 값이 있을 때만 렌더한다. 보드별 충전율이 25~83%로 크게 갈려
 * (갱년기톡 33% · 웃음방 25%) 자리를 항상 확보하면 빈 줄이 생긴다.
 *
 * 구성: 제목 → preview(2줄, 있을 때만) → 메타 줄 → 통계 줄.
 * 메타와 통계를 한 줄에 두던 때는 폭이 모자라 12행 중 최대 12행이 2줄로 접혔다.
 * 접힌 메타(57px)가 제목 1줄(27px)의 2배라 행 높이가 88~215px로 튀었고, 그 편차가
 * "빽빽하고 어색한" 느낌의 원인이었다. 역할이 다른 두 정보를 나눠 각각 1줄로 만든다.
 */
function PostCard({ post, boardSlug, showBoardBadge = false }: PostCardProps) {
  // 공백만 있는 preview도 빈 값으로 취급 — 빈 줄 방지
  const preview = post.preview?.trim()

  return (
    <Link
      href={`/community/${boardSlug}/${post.slug ?? post.id}`}
      className="block border-b border-border py-4 no-underline text-inherit transition-colors last:border-b-0 hover:bg-muted/40"
    >
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

      {preview && (
        <p className="text-caption text-muted-foreground m-0 mt-2 line-clamp-2 leading-[1.5]">
          {preview}
        </p>
      )}

      {/* 메타 줄 — 카테고리 · 작성자 · 시간. 통계는 아래 별도 줄로 분리한다.
          한 줄에 몰려 있을 때는 폭이 모자라 12행 중 최대 12행이 2줄로 접혔고(제목 1줄의 2배 높이),
          그 들쭉날쭉함이 목록 리듬을 깨뜨렸다. 역할이 다른 두 정보를 나누면 각각 1줄에 들어간다.
          flex-wrap은 그대로 둔다 — 예상 못 한 긴 닉네임/카테고리에서 잘리는 것보다 접히는 편이 낫다. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        {/* /best는 여러 보드가 섞이므로 색 배지가 출처 표시 역할을 한다(보드별로 색이 실제로 갈림).
            반면 게시판 목록은 이미 그 보드 안이라 12행의 배지 색이 전부 같아 정보가 아니라 반복 노이즈다.
            → showBoardBadge일 때만 배지, 그 외에는 조용한 muted 텍스트. */}
        {showBoardBadge ? (
          <CategoryBadge
            boardType={post.boardType as string}
            label={BOARD_DISPLAY_NAMES[post.boardType as BoardType] ?? post.boardType}
            variant="compact"
          />
        ) : post.category ? (
          <>
            {/* 크기·색은 메타행에서 상속(text-caption / text-muted-foreground).
                굵기는 상속 기본값 — 닉네임(font-medium)보다 한 단계 조용하게 둔다. */}
            <span>{post.category}</span>
            <span className="text-border">·</span>
          </>
        ) : null}
        <span className="flex items-center gap-1">
          <span>{post.author.gradeEmoji}</span>
          <span className="font-medium">{post.author.nickname}</span>
        </span>
        <span className="text-border">·</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>

      {/* 통계 줄 — 반응 수치만 모은다. 세 항목이 ~130px라 XLARGE에서도 한 줄에 들어간다. */}
      <div className="mt-2 flex items-center gap-4 text-caption text-muted-foreground">
        <span className="flex items-center gap-1" aria-label={`좋아요 ${post.likeCount}개`}>
          <IconHeart size={16} /> {post.likeCount}
        </span>
        <span className="flex items-center gap-1" aria-label={`댓글 ${post.commentCount}개`}>
          <IconComment size={16} /> {post.commentCount}
        </span>
        <span className="flex items-center gap-1" aria-label={`조회 ${post.viewCount}회`}>
          <IconEye size={16} /> {post.viewCount}
        </span>
      </div>
    </Link>
  )
}

export default memo(PostCard, (prev, next) =>
  prev.post.id === next.post.id &&
  prev.boardSlug === next.boardSlug &&
  prev.showBoardBadge === next.showBoardBadge,
)
