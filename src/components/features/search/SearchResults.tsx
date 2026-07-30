import Link from 'next/link'
import type { SearchResult, SearchTab } from '@/lib/queries/search'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { formatTimeAgo } from '../community/utils'
import { IconSearch, IconHeart, IconComment } from '@/components/icons'

interface SearchResultsProps {
  result: SearchResult
  query: string
  tab: SearchTab
}

export default function SearchResults({ result, query, tab }: SearchResultsProps) {
  if (result.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-2 text-muted-foreground">
          <IconSearch size={28} />
        </div>
        <p className="text-body text-muted-foreground leading-relaxed">
          검색 결과가 없어요.
          <br />
          다른 키워드로 검색해 보세요.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8">
      <p className="text-body text-muted-foreground">
        &ldquo;<span className="font-bold text-foreground">{query}</span>&rdquo; 검색 결과{' '}
        <span className="font-bold text-primary-text">{result.totalCount}</span>건
      </p>

      {/* 일자리 */}
      {(tab === 'all' || tab === 'jobs') && result.jobs.items.length > 0 && (
        <ResultSection
          title="💼 일자리"
          count={result.jobs.total}
          items={result.jobs.items}
          query={query}
          moreHref={tab === 'all' ? `/search?q=${encodeURIComponent(query)}&tab=jobs` : undefined}
        />
      )}

      {/* 게시글 */}
      {(tab === 'all' || tab === 'posts') && result.posts.items.length > 0 && (
        <ResultSection
          title="💬 게시글"
          count={result.posts.total}
          items={result.posts.items}
          query={query}
          moreHref={tab === 'all' ? `/search?q=${encodeURIComponent(query)}&tab=posts` : undefined}
        />
      )}

      {/* 매거진 */}
      {(tab === 'all' || tab === 'magazine') && result.magazine.items.length > 0 && (
        <ResultSection
          title="📖 매거진"
          count={result.magazine.total}
          items={result.magazine.items}
          query={query}
          moreHref={tab === 'all' ? `/search?q=${encodeURIComponent(query)}&tab=magazine` : undefined}
        />
      )}
    </div>
  )
}

/* ── 카테고리별 결과 섹션 ── */

function ResultSection({
  title,
  count,
  items,
  query,
  moreHref,
}: {
  title: string
  count: number
  items: PostSummary[]
  query: string
  moreHref?: string
}) {
  return (
    <section>
      <h3 className="text-body font-bold text-foreground mb-4">
        {title} <span className="text-muted-foreground font-normal">({count}건)</span>
      </h3>

      {/* 카드 간격(space-y-3) 대신 행의 border-b가 리듬을 만든다 — 게시판 목록과 같은 방식. */}
      <div>
        {items.map((post) => (
          <SearchResultCard key={post.id} post={post} query={query} />
        ))}
      </div>

      {moreHref && count > items.length && (
        <Link
          href={moreHref}
          className="inline-flex items-center gap-1 mt-4 text-body text-primary-text font-medium no-underline min-h-[52px] px-2"
        >
          더보기 →
        </Link>
      )}
    </section>
  )
}

/* ── 검색 결과 카드 ── */

/**
 * 댓글 영역이 없는 정보성 보드 — 검색 결과에서도 댓글 수를 표시하지 않는다.
 * 상세(매거진·내일찾기)에 CommentSection이 없으므로, 검색에만 "댓글 3"이 보이면
 * 눌러도 댓글이 없는 불일치가 된다. 커뮤니티 4보드(STORY/MENOPAUSE/LIFE2/HUMOR)는 그대로 노출.
 */
const INFO_ONLY_BOARDS = new Set<string>(['JOB', 'MAGAZINE'])

/**
 * 검색 결과 한 줄.
 *
 * 게시판 목록(PostCard, #248)과 같은 디자인 언어를 쓴다 — 같은 글이 화면마다 다르게
 * 보이지 않게 하기 위해서다. 카드 껍데기를 걷어내고 제목-first · 3단 위계 ·
 * 메타/통계 분리를 그대로 따른다.
 *
 * ⚠️ [APPLIES TO] PostCard.tsx와 위계 값을 공유한다. 한쪽만 바꾸면 다시 어긋난다.
 *   1단 제목      foreground   / 700 / text-body   / leading 1.4
 *   2단 preview   muted-strong / 400 / text-caption / leading 1.6
 *   3단 메타·통계 muted-subtle / 400 / text-caption
 *   간격 제목→preview 6px < preview→메타 16px (읽기 덩어리 분리), 메타→통계 6px
 *
 * PostCard를 그대로 쓸 수 없는 이유(= 검색 고유 로직):
 *   - href가 boardType 3분기다(JOB/MAGAZINE/커뮤니티). PostCard는 커뮤니티 고정.
 *   - 제목·preview에 <HighlightText>(ReactNode)를 넣어야 한다. PostCard는 문자열만 받는다.
 *   - INFO_ONLY_BOARDS 댓글 숨김 정책이 있다.
 * 조회수는 넣지 않는다 — 검색은 찾기가 목적이라 정보 밀도를 늘리지 않는다.
 */
function SearchResultCard({ post, query }: { post: PostSummary; query: string }) {
  const boardSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? 'stories'
  const href = post.boardType === 'JOB'
    ? `/jobs/${post.id}`
    : post.boardType === 'MAGAZINE'
    ? `/magazine/${post.slug ?? post.id}`
    : `/community/${boardSlug}/${post.slug ?? post.id}`

  return (
    <Link
      href={href}
      prefetch={false}
      className="block border-b border-border py-[18px] no-underline text-inherit transition-colors last:border-b-0 hover:bg-muted/40"
    >
      <h4 className="text-body font-bold text-foreground m-0 line-clamp-2 leading-[1.4]">
        <HighlightText text={post.title} keyword={query} />
      </h4>

      {post.preview && (
        <p className="text-caption text-muted-strong m-0 mt-1.5 line-clamp-2 leading-[1.6]">
          <HighlightText text={post.preview} keyword={query} />
        </p>
      )}

      {/* 메타 줄 — 카테고리 · 작성자 · 시간.
          검색은 여러 보드가 섞이므로 카테고리(출처 성격)를 남기되, 색 배지 덩어리 대신
          조용한 텍스트로 둔다. JOB은 category가 부여되지 않아 자연히 표시되지 않는다.
          등급 이모지는 목록(#248)과 같이 뺀다 — 상세·댓글·마이페이지·/grade에는 그대로 있다. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-subtle">
        {post.category && (
          <>
            <span className="font-medium">{post.category}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{post.author.nickname}</span>
        <span aria-hidden="true">·</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
      </div>

      {/* 통계 줄 — 이모지 문자(❤️💬) 대신 목록과 같은 SVG 아이콘 14px. */}
      <div className="mt-1.5 flex items-center gap-4 text-caption text-muted-subtle">
        <span className="flex items-center gap-1" aria-label={`좋아요 ${post.likeCount}개`}>
          <IconHeart size={14} /> {post.likeCount}
        </span>
        {/* 매거진·내일찾기는 상세에 댓글 영역이 없는 정보성 콘텐츠 → 검색에서도 댓글 수를 숨긴다.
            (좋아요는 세 보드 모두 상세에 ActionBar가 있어 그대로 노출) */}
        {!INFO_ONLY_BOARDS.has(post.boardType) && (
          <span className="flex items-center gap-1" aria-label={`댓글 ${post.commentCount}개`}>
            <IconComment size={14} /> {post.commentCount}
          </span>
        )}
      </div>
    </Link>
  )
}

/* ── 키워드 하이라이트 ── */

function HighlightText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-primary/15 text-primary-text font-bold rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
