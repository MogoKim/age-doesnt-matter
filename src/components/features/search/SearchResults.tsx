import Link from 'next/link'
import type { SearchResult, SearchTab } from '@/lib/queries/search'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { formatTimeAgo } from '../community/utils'
import { IconSearch } from '@/components/icons'

interface SearchResultsProps {
  result: SearchResult
  query: string
  tab: SearchTab
}

export default function SearchResults({ result, query, tab }: SearchResultsProps) {
  if (result.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-2 text-muted-foreground">
          <IconSearch size={28} />
        </div>
        <p className="text-base text-muted-foreground leading-relaxed">
          검색 결과가 없어요.
          <br />
          다른 키워드로 검색해 보세요.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8">
      <p className="text-base text-muted-foreground">
        &ldquo;<span className="font-bold text-foreground">{query}</span>&rdquo; 검색 결과{' '}
        <span className="font-bold text-primary">{result.totalCount}</span>건
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
      <h3 className="text-base font-bold text-foreground mb-4">
        {title} <span className="text-muted-foreground font-normal">({count}건)</span>
      </h3>

      <div className="space-y-3">
        {items.map((post) => (
          <SearchResultCard key={post.id} post={post} query={query} />
        ))}
      </div>

      {moreHref && count > items.length && (
        <Link
          href={moreHref}
          className="inline-flex items-center gap-1 mt-4 text-base text-primary font-medium no-underline min-h-[52px] px-2"
        >
          더보기 →
        </Link>
      )}
    </section>
  )
}

/* ── 검색 결과 카드 ── */

function SearchResultCard({ post, query }: { post: PostSummary; query: string }) {
  const boardSlug = BOARD_TYPE_TO_SLUG[post.boardType] ?? 'stories'
  const href = post.boardType === 'JOB'
    ? `/jobs/${post.id}`
    : `/community/${boardSlug}/${post.id}`

  return (
    <Link
      href={href}
      className="block p-4 bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30"
    >
      {post.category && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[13px] font-bold mb-2">
          {post.category}
        </span>
      )}
      <h4 className="text-base font-bold text-foreground m-0 mb-1 line-clamp-2">
        <HighlightText text={post.title} keyword={query} />
      </h4>
      {post.preview && (
        <p className="text-sm text-muted-foreground m-0 line-clamp-2 leading-relaxed">
          <HighlightText text={post.preview} keyword={query} />
        </p>
      )}
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground mt-2">
        <span>{post.author.gradeEmoji} {post.author.nickname}</span>
        <span>❤️ {post.likeCount}</span>
        <span>💬 {post.commentCount}</span>
        <span>{formatTimeAgo(post.createdAt)}</span>
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
          <mark key={i} className="bg-primary/15 text-primary font-bold rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
