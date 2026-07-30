import { memo } from 'react'
import Link from 'next/link'
import type { PostSummary } from '@/types/api'
import { formatTimeAgo } from './utils'
import { IconHeart, IconComment, IconEye } from '@/components/icons'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'
import type { BoardType } from '@/generated/prisma/client'

interface PostCardProps {
  post: PostSummary
  boardSlug: string
  /** /best처럼 여러 보드가 섞이는 목록에서 출처(게시판 이름)를 보여준다. */
  showBoardBadge?: boolean
}

/**
 * 게시글 목록 한 줄(리스트 행).
 *
 * 카드가 아니라 구분선으로 나뉜 행이다. 좌우 padding을 두지 않는다 — 소비처 4곳의
 * 상위 컨테이너가 이미 px-4(md:px-6)를 가지고 있어, 여기서 또 주면 한 번 더 밀린다.
 *
 * ── 3단 위계 ──
 * 이전에는 preview·메타·통계가 모두 15px / 400 / muted-foreground로 완전히 같아,
 * 사용자 눈에 "굵은 제목 + 회색 덩어리 3줄"로만 보였다. 읽을 것(preview)과 참고할
 * 것(메타·통계)이 구분되지 않아 제목·미리보기에 시선이 모이지 않았다.
 *   1단 제목      foreground   / 700 / text-body
 *   2단 preview   muted-strong / 400 / text-caption   ← 읽는 정보
 *   3단 메타·통계 muted-subtle / 400 / text-caption   ← 참고 정보
 *
 * ── 덩어리 간격 ──
 * 구성은 제목 → preview → 메타 → 통계 네 줄이지만, 간격으로 두 덩어리로 묶는다.
 *   제목 →preview  6px  ← 읽기 덩어리 내부
 *   preview→메타   16px ← 덩어리 경계 (가장 넓다)
 *   메타 →통계     6px  ← 부가 정보 덩어리 내부
 * 이전 8/10/8px은 차이가 2px뿐이라 네 요소가 균등하게 흩어져 보였다.
 *
 * ── 표시하지 않는 것 ──
 * 소주제 카테고리(자유수다·가족 등)는 같은 게시판 안에서 변별력이 낮고 매 행 반복돼
 * 노이즈였다(실측 3행 중 2행이 "자유수다"). 카테고리 필터도 이미 숨김 상태라
 * 걸러볼 수단도 없다. DB 저장·쿼리는 그대로 두고 화면 표시만 뺀다.
 * 등급 이모지도 목록에서는 뺀다 — 상세 작성자·댓글·검색·마이페이지·/grade에는 그대로 있다.
 *
 * preview는 값이 있을 때만 렌더한다(보드별 충전율 25~83%). 자리를 항상 확보하면
 * 빈 줄이 생긴다. 채움률은 PR #247과 백필로 해결할 문제이지 UI로 덮을 문제가 아니다.
 */
function PostCard({ post, boardSlug, showBoardBadge = false }: PostCardProps) {
  // 공백만 있는 preview도 빈 값으로 취급 — 빈 줄 방지
  const preview = post.preview?.trim()
  const boardName = showBoardBadge
    ? BOARD_DISPLAY_NAMES[post.boardType as BoardType] ?? post.boardType
    : null

  return (
    <Link
      href={`/community/${boardSlug}/${post.slug ?? post.id}`}
      className="block border-b border-border py-[18px] no-underline text-inherit transition-colors last:border-b-0 hover:bg-muted/40"
    >
      <h2 className="text-body font-bold text-foreground m-0 line-clamp-2 leading-[1.4]">
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
        <p className="text-caption text-muted-strong m-0 mt-1.5 line-clamp-2 leading-[1.6]">
          {preview}
        </p>
      )}

      {/* 메타 줄 — 출처(/best만) · 닉네임 · 시간.
          통계와 한 줄로 합치면 /best는 출처가 더해져 폭이 모자라 12행 전부 2줄로 접혔다
          (XLARGE 실측). 역할이 다른 두 정보를 나눠 각각 1줄로 유지한다. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-subtle">
        {boardName && (
          <>
            <span className="font-medium">{boardName}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{post.author.nickname}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>

      {/* 통계 줄 — 메타와 같은 층위(muted-subtle)라 간격을 좁게 둬 한 덩어리로 묶는다.
          아이콘은 14px — 16px일 때는 숫자보다 커서 시선을 먼저 끌었다. */}
      <div className="mt-1.5 flex items-center gap-4 text-caption text-muted-subtle">
        <span className="flex items-center gap-1" aria-label={`좋아요 ${post.likeCount}개`}>
          <IconHeart size={14} /> {post.likeCount}
        </span>
        <span className="flex items-center gap-1" aria-label={`댓글 ${post.commentCount}개`}>
          <IconComment size={14} /> {post.commentCount}
        </span>
        <span className="flex items-center gap-1" aria-label={`조회 ${post.viewCount}회`}>
          <IconEye size={14} /> {post.viewCount}
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
