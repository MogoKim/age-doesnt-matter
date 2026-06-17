import Link from 'next/link'
import { getRecentGreetings } from '@/lib/queries/posts'

/**
 * 홈 신입환영 섹션 (Phase 3, server component) — 실유저 환대 2층.
 * 최근 3일 가입인사 글을 "의도적 예외 창구"로 홈에서만 노출(목록/베스트/검색/sitemap 제외 정책은 유지).
 * 0건이면 null(빈 섹션 방지). 모든 유저(회원+비회원)에게 노출.
 * 캐싱은 getRecentGreetings(unstable_cache, tag=home-newcomers)에서 처리 → 홈 Static 유지.
 */
export default async function NewcomerWelcomeSection() {
  const newcomers = await getRecentGreetings()
  if (newcomers.length === 0) return null

  return (
    // data-nosnippet: 가입인사(상세 noindex/sitemap 제외)가 홈(index 대상) HTML에 들어가므로
    // 검색 스니펫에 닉네임/미리보기가 노출되지 않도록 이 섹션을 스니펫에서 제외
    <section
      className="pt-2 pb-6 border-b-4 border-background lg:pt-4 lg:pb-8 lg:border-b-0"
      aria-label="최근 새로 온 이웃"
      data-nosnippet
    >
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-title font-bold text-foreground flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary/10 text-xl">👋</span>
          최근 새로 온 이웃
        </h2>
      </div>
      <ul className="list-none m-0 px-4 lg:px-0">
        {newcomers.map((n) => (
          <li key={n.id} className="group">
            <Link
              href={`/community/stories/${n.slug ?? n.id}`}
              className="group block py-3.5 border-b border-border/60 no-underline text-inherit min-h-[52px] motion-safe:transition-[border-color] motion-safe:duration-[250ms] motion-reduce:transition-none [@media(hover:hover)]:hover:border-primary active:border-primary"
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="text-body font-bold text-primary-text">{n.nickname}</span>
                <span className="text-caption text-muted-foreground">님이 인사를 남겼어요</span>
              </div>
              {n.preview && (
                <p className="text-body font-medium text-foreground leading-[1.5] line-clamp-2 break-keep motion-safe:transition-colors motion-safe:duration-[250ms] motion-reduce:transition-none [@media(hover:hover)]:group-hover:text-primary-text group-active:text-primary-text">{n.preview}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
