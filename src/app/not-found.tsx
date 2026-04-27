import { Suspense } from 'react'
import Link from 'next/link'
import { IconSearch } from '@/components/icons'
import { getLatestMagazinePosts } from '@/lib/queries/posts/posts.magazine'

async function LatestMagazineSection() {
  const latestMagazine = await getLatestMagazinePosts(3).catch(() => [])
  if (latestMagazine.length === 0) return null

  return (
    <div className="mb-10">
      <h2 className="text-body font-bold text-foreground mb-4">
        이런 글은 어떠세요?
      </h2>
      <div className="space-y-3">
        {latestMagazine.map((post) => (
          <Link
            key={post.id}
            href={`/magazine/${post.slug ?? post.id}`}
            className="flex items-start gap-3 p-4 bg-card rounded-xl border border-border no-underline transition-all hover:border-primary/30 hover:shadow-sm min-h-[52px]"
          >
            <div className="flex-1 min-w-0">
              {post.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-foreground text-caption font-bold mb-1">
                  {post.category}
                </span>
              )}
              <p className="text-body font-medium text-foreground m-0 line-clamp-2 leading-[1.4]">
                {post.title}
              </p>
            </div>
            <span className="text-caption text-muted-foreground flex-shrink-0 mt-1">→</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function NotFound() {
  return (
    <div className="min-h-screen px-4 pt-16 pb-12 max-w-[720px] mx-auto">
      {/* 상단 안내 */}
      <div className="text-center mb-10">
        <div className="mb-4 text-muted-foreground flex justify-center">
          <IconSearch size={56} />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          페이지를 찾을 수 없어요
        </h1>
        <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
          주소가 잘못되었거나, 삭제된 페이지일 수 있어요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 bg-primary text-white font-bold text-body rounded-2xl no-underline transition-opacity hover:opacity-90"
          >
            홈으로 가기
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center min-h-[52px] px-8 py-3 border-2 border-border bg-card text-foreground font-bold text-body rounded-2xl no-underline transition-colors hover:border-primary hover:text-primary"
          >
            검색하기
          </Link>
        </div>
      </div>

      {/* 최신 매거진 */}
      <Suspense fallback={null}>
        <LatestMagazineSection />
      </Suspense>

      {/* 인기 게시판 바로가기 */}
      <div>
        <h2 className="text-body font-bold text-foreground mb-4">
          커뮤니티 둘러보기
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '사는이야기', href: '/community/stories', emoji: '💬' },
            { label: '웃음방', href: '/community/humor', emoji: '😄' },
            { label: '2막준비', href: '/community/life2', emoji: '🌱' },
          ].map(({ label, href, emoji }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1.5 p-4 bg-card rounded-xl border border-border no-underline transition-all hover:border-primary/30 hover:shadow-sm min-h-[72px] text-center"
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-[15px] font-bold text-foreground">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
