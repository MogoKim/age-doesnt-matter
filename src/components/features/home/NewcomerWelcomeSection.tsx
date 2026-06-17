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
      className="my-4 mx-4 rounded-2xl border border-primary/20 bg-primary/5 p-4"
      aria-label="최근 새로 온 이웃"
      data-nosnippet
    >
      <h2 className="mb-3 text-[18px] font-bold text-foreground">👋 최근 새로 온 이웃</h2>
      <ul className="flex flex-col gap-2">
        {newcomers.map((n) => (
          <li key={n.id}>
            <Link
              href={`/community/stories/${n.slug ?? n.id}`}
              className="block min-h-[52px] rounded-xl border border-border bg-background p-3 active:bg-muted"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[16px] font-bold text-primary-text">{n.nickname}</span>
                <span className="text-[14px] text-muted-foreground">님이 인사를 남겼어요</span>
              </div>
              {n.preview && (
                <p className="mt-1 line-clamp-1 text-[15px] text-foreground">{n.preview}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
