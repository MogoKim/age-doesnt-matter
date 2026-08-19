import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getBoardConfig } from '@/lib/queries/boards'
import { getPostDetail, getRelatedCommunityPosts, getCrossBoardCandidates } from '@/lib/queries/posts'
import { getCommentsByPostId, getForumCommentsForJsonLd } from '@/lib/queries/comments'
import { buildDiscussionForumJsonLd, DFP_COMMENT_LIMIT } from '@/lib/seo/discussion-forum'
import ActionBar from '@/components/features/community/ActionBar'
import PostCTA from '@/components/features/community/PostCTA'
import PostOwnerActions from '@/components/features/community/PostOwnerActions'
import CommentSection from '@/components/features/community/CommentSection'
import { formatTimeAgo } from '@/components/features/community/utils'
import { sanitizeHtml, proxyR2Images } from '@/lib/sanitize'
import AdSenseUnit from '@/components/ad/AdSenseUnit'
import NativeAdSlot from '@/components/ad/NativeAdSlot'
import CoupangBanner from '@/components/ad/CoupangBanner'
import PostListBottom from '@/components/features/community/PostListBottom'
import NextPostsInline from '@/components/features/community/NextPostsInline'
import { ADSENSE } from '@/components/ad/ad-slots'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import GTMEventOnMount from '@/components/common/GTMEventOnMount'
import PostViewBeacon from '@/components/common/PostViewBeacon'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'
import { GREETING_CATEGORY } from '@/lib/greeting'
import { EVENT_CATEGORY } from '@/lib/event-category'
import { resolveCommunityCanonicalPath } from '@/lib/community-canonical'
import { shouldGoogleNoindexCommunityPost } from '@/lib/seo/community-google-noindex'

interface PageProps {
  params: Promise<{ boardSlug: string; postId: string }>
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
export const dynamic = 'force-static'
// ISR Writes 절감: 봇 순회 재생성 완화(30→300→3600s). 회원 댓글은 CommentSection의 no-store
// 재조회 + 댓글 작성 revalidatePath/Tag가 즉시성 담당 → TTL은 비로그인 노출 주기만 결정.
//
// 3600s 근거 (2026-08-19 Vercel Usage 실측, Jul 1~Aug 19):
//   ISR Writes 10.79M = $56.10 — 전 항목 1위(다음이 Fast Origin Transfer $40.82).
//   이 route의 ISR 엔트리가 10,003개로 전체 모수의 94%라 TTL이 그대로 비용에 곱해진다.
//   글 본문은 발행 후 거의 바뀌지 않으므로 짧은 TTL의 이득이 없다.
export const revalidate = 3600

/** fallback description에 넣을 게시판 맥락 라벨 (BoardType → 노출 문구) */
const BOARD_CONTEXT_LABEL: Record<string, string> = {
  STORY: '사는이야기',
  LIFE2: '인생 2막',
  HUMOR: '웃음방',
  MENOPAUSE: '갱년기톡',
}

/** 제목이 길어도 description 총 길이가 널뛰지 않도록 앞부분만 쓴다 */
const FALLBACK_TITLE_MAX_CHARS = 60

/**
 * seoDescription·preview가 **둘 다** 없는 글의 마지막 수단.
 *
 * 고정 문구 하나를 돌려주면 그 글들이 전부 같은 `<meta name="description">`을 달게 되고,
 * 네이버 사이트 진단이 "동일 설명문 발견"으로 잡는다(2026-08-18 실측: PUBLISHED 109건이
 * 같은 문장을 공유, 그중 95건이 웃음방). 그래서 제목·게시판으로 URL마다 다르게 만든다.
 * 본문을 지어내지 않는다 — 제목에 이미 있는 사실만 재배열한다.
 */
function buildFallbackDescription(title: string, boardType: string): string {
  const label = BOARD_CONTEXT_LABEL[boardType] ?? '우리 나이'
  const flat = title.replace(/\s+/g, ' ').trim()
  const head = flat.length > FALLBACK_TITLE_MAX_CHARS
    ? `${flat.slice(0, FALLBACK_TITLE_MAX_CHARS)}…`
    : flat
  // 제목 5~60자 → 총 75~130자. 스니펫이 잘리지도, 너무 비어 보이지도 않는 구간이다.
  return `${head} — 40대 50대 여성이 ${label}에서 나눈 이야기입니다. 우리 또래의 경험과 생각을 편하게 읽어보고, 내 이야기도 남겨보세요.`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug, postId: rawPostId } = await params
  const postId = decodeURIComponent(rawPostId)
  // getPostDetail(postId) without user state is shared with the page render through Data Cache.
  // This avoids a separate getPostMeta DB round trip on the first ISR/MISS request.
  const post = await getPostDetail(postId)
  // 미존재·HIDDEN·DELETED(getPostDetail은 PUBLISHED/SEO_ONLY만 조회) — metadata 단계는 스트리밍
  // 시작 전이므로 여기서 notFound()를 던져야 HTTP 404가 확정된다(렌더 단계 notFound는 loading.tsx/
  // Suspense 스트리밍이 200 헤더를 먼저 보내 무력화). Next가 noindex를 자동 삽입 — 명시 robots 불필요(중복 해소)
  if (!post) notFound()

  // 정본 URL 교정(PR-M0): CUID 접근 + 보드 불일치(글 이동 후 옛 보드 URL)를 한 번의 308로.
  // metadata 단계는 streaming 시작 전이라 여기서 redirect해야 상태코드가 확정된다.
  const canonicalPath = resolveCommunityCanonicalPath({ boardSlug, postId, post })
  if (canonicalPath) permanentRedirect(canonicalPath)

  const canonicalId = post.slug ?? postId
  const url = `${BASE_URL}/community/${boardSlug}/${canonicalId}`
  const description = post.preview || buildFallbackDescription(post.title, post.boardType)

  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? description,
    alternates: { canonical: url },
    openGraph: {
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? description,
      url,
      type: 'article',
      siteName: '우리 나이가 어때서',
      locale: 'ko_KR',
      ...(post.thumbnailUrl ? { images: [{ url: post.thumbnailUrl, width: 1200, height: 630, alt: post.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seoTitle ?? post.title,
      description: post.seoDescription ?? description,
    },
    // 가입인사·참여이벤트 글은 검색엔진 색인 제외(내부 콘텐츠 — 목록/sitemap에서도 제외, 이벤트는 /events로 redirect).
    // 이 정책이 항상 우선한다. 해당되지 않는 일반 글 중 HUMOR 전체(PR-B2)와 주제·분량 기준에
    // 못 미치는 STORY/LIFE2(PR-B3)를 **구글에만** 색인 제외하고,
    // 네이버 등 다른 봇에는 index/follow를 유지한다(sitemap·robots.txt 무변경 — 네이버 수집 경로 보존).
    ...(post.category === GREETING_CATEGORY || post.category === EVENT_CATEGORY
      ? { robots: { index: false, follow: false } }
      : shouldGoogleNoindexCommunityPost({
            boardType: post.boardType,
            title: post.title,
            content: post.content,
            source: post.source,
          })
        ? { robots: { index: true, follow: true, googleBot: { index: false, follow: true } } }
        : {}),
  }
}

async function CommentsLoader({ postId, isGreeting }: {
  postId: string
  isGreeting?: boolean
}) {
  const comments = await getCommentsByPostId(postId)
  return <CommentSection postId={postId} comments={comments} isGreeting={isGreeting} />
}

export default async function PostDetailPage({ params }: PageProps) {
  const { boardSlug, postId: rawPostId } = await params
  const postId = decodeURIComponent(rawPostId)

  const [board, post] = await Promise.all([
    getBoardConfig(boardSlug),
    getPostDetail(postId),
  ])
  if (!board) notFound()
  if (!post) notFound()

  const backHref = `/community/${boardSlug}`
  const backLabel = board.displayName

  // 정본 URL 교정(PR-M0): CUID→slug + 보드 불일치(글 이동 후 옛 보드 URL) 통합 308 — metadata와 동일 규칙
  const canonicalPath = resolveCommunityCanonicalPath({ boardSlug, postId, post })
  if (canonicalPath) permanentRedirect(canonicalPath)

  // slug로 접근한 경우에도 DB의 실제 CUID를 사용 (comments/likes FK 보장)
  const resolvedId = post.id

  // 관련글 1회 조회 → 본문끝 추천(후보 24 → 클라 점수화 상위 3) + 하단 목록(slice 12) 공용
  // crossBoard: algo v2(A/B) 전용 크로스보드 후보. v1·하단 목록은 related(같은 보드)만 사용.
  const [related, crossBoard] = await Promise.all([
    getRelatedCommunityPosts(post.boardType, post.category || null, resolvedId, 24),
    getCrossBoardCandidates(post.boardType, post.category || null, resolvedId, 12),
  ])

  // 참여 이벤트 연동글은 공식 상세(/events)로 이관 — 사는이야기 게시글 상세로 노출하지 않는다.
  // 판정은 getPostDetail의 category(캐시 안정)만 사용. 대상 vote id 해석·HIDDEN 판정은 /events(force-dynamic)가 담당.
  // (force-static 페이지에서 직접 voteEvent 조회는 렌더 시 불안정 → category 기준으로만 redirect)
  if (post.category === EVENT_CATEGORY) permanentRedirect(`/events/${resolvedId}`)
  // ↑ 여기까지 통과하면 이벤트글이 아님 → 일반 사는이야기 글로 렌더(투표 레이아웃은 /events가 담당)

  const canonicalSlug = post.slug ?? postId
  const url = `${BASE_URL}/community/${boardSlug}/${canonicalSlug}`
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: '홈', path: '/' },
    { name: board.displayName, path: `/community/${boardSlug}` },
    { name: post.title, path: `/community/${boardSlug}/${canonicalSlug}` },
  ])
  const firstContentImage = post.content
    ? (post.content.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null)
    : null
  const ogImage = post.thumbnailUrl || firstContentImage || `${BASE_URL}/icon-1024.png`
  const plainText = post.content
    ? post.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
  // 커뮤니티 글 = 포럼/토론 → Article 대신 DiscussionForumPosting (GSC 권장). Breadcrumb은 별도 유지.
  // JSON-LD comment[]용 ACTIVE 최상위 댓글만 별도 경량 조회(HIDDEN/DELETED 제외, 상한 DFP_COMMENT_LIMIT).
  const forumComments = await getForumCommentsForJsonLd(resolvedId, DFP_COMMENT_LIMIT)
  const jsonLd = buildDiscussionForumJsonLd({
    title: post.title,
    // metadata description과 같은 fallback을 쓴다 — 두 곳이 갈라지면 같은 글이 서로 다른 설명을 갖는다.
    text: plainText || post.preview || buildFallbackDescription(post.title, post.boardType),
    authorName: post.author.nickname,
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    url,
    image: ogImage,
    likeCount: post.likeCount ?? 0,
    viewCount: post.viewCount ?? 0,
    commentCount: post.commentCount ?? 0,
    publisherName: '우리 나이가 어때서',
    publisherUrl: BASE_URL,
    comments: forumComments,
  })

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8 bg-[var(--surface-warm)] min-h-screen">
      {/* GA4 게시글 조회 이벤트 + PostView DB 기록 */}
      <GTMEventOnMount event="post_view" data={{ post_id: resolvedId, board_type: board.boardType, category: post.category ?? '' }} />
      <PostViewBeacon postId={resolvedId} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: '홈', href: '/' },
        { label: board.displayName, href: `/community/${boardSlug}` },
        { label: post.title },
      ]} />

      {/* 뒤로가기 */}
      <div className="flex items-center justify-between">
        {/* lg:hidden: 데스크탑은 Breadcrumbs의 breadcrumb nav가 내비게이션 담당 */}
        <Link href={backHref} className="lg:hidden inline-flex items-center gap-1 text-[17px] font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-colors hover:text-primary-text hover:bg-primary/5">
          ← {backLabel}
        </Link>
        <PostOwnerActions authorId={post.author.id} boardSlug={boardSlug} postId={resolvedId} />
      </div>

      {/* 정체성 배너 (네이버 유입자 락인 ① — 비회원, 제목 위) */}
      {/* 풀블리드: wrapper의 px-4(md:px-6)를 음수 마진으로 탈출하고 같은 값의 padding으로 글 기준선 복귀 */}

      {/* 글 본문 영역 — 카드 wrapper 없이 wrapper padding만 사용.
          (구 구조: bg-card rounded-2xl border shadow-sm p-4 로 감쌌더니 wrapper px-4와 이중이 되어
           375px에서 본문 폭이 303px까지 줄고 글이 문서가 아니라 위젯처럼 보였다) */}
      {/* 헤더 */}
      <div className="pb-5 mb-5 border-b border-border">
        <h1 className="text-xl font-bold text-foreground m-0 mb-4 leading-[1.4]">{post.title}</h1>
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <span title={post.author.gradeEmoji}>{post.author.gradeEmoji}</span>
          <span className="font-bold text-foreground">{post.author.nickname}</span>
          <span>·</span>
          <span>{formatTimeAgo(post.createdAt)}</span>
          <span>·</span>
          <span>👁 {post.viewCount}</span>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="post-content text-body text-foreground leading-[1.85] mb-6 break-keep [&_p]:mb-4 [&_img]:h-auto [&_img]:my-4 [&_img]:rounded-xl [&_img]:-mx-4 [&_img]:w-[calc(100%+2rem)] [&_img]:max-w-[calc(100%+2rem)] md:[&_img]:mx-0 md:[&_img]:w-full md:[&_img]:max-w-full [&_hr]:border-border [&_hr]:my-6 [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:my-4 [&_video]:my-4 [&_video]:rounded-xl [&_video]:-mx-4 [&_video]:w-[calc(100%+2rem)] md:[&_video]:mx-0 md:[&_video]:w-full [&_.image-placeholder]:py-6 [&_.image-placeholder]:px-4 [&_.image-placeholder]:bg-muted [&_.image-placeholder]:rounded-xl [&_.image-placeholder]:text-center [&_.image-placeholder]:text-muted-foreground [&_.image-placeholder]:text-[17px] [&_.image-placeholder]:my-4"
        dangerouslySetInnerHTML={{ __html: proxyR2Images(sanitizeHtml(post.content)) }}
      />

      {/* 광고① — 인아티클. 본문 바로 뒤, 공감 구분선 위.
          본문 mb-6(24px) / 이 wrapper mb-6(24px)로 본문·구분선 양쪽에서 떨어뜨린다 —
          광고가 본문이나 공감 버튼에 붙어 보이지 않게 하는 것이 목적. */}
      <div className="mb-6">
        <NativeAdSlot slotId="community-detail-inarticle" minHeight={230} fallback={<AdSenseUnit slotId={ADSENSE.IN_ARTICLE} format="fluid" layout="in-article" className="rounded-2xl overflow-hidden" />} />
      </div>

      {/* 액션 바 — 구분선(border-t)은 공감 바로 위에 둔다. 읽기(본문·광고)와 행동(공감)의 경계.
          pt-3: 구분선과 버튼 사이 / mb-8: 다음 순서인 댓글까지 간격 */}
      <ActionBar
        postId={resolvedId}
        title={post.title}
        description={post.preview}
        likeCount={post.likeCount}
        isLiked={false}
        isScrapped={false}
        className="border-y-0 border-t pt-3 mb-8"
      />

      {/* 댓글 — 공감 직후. 읽고 → 공감하고 → 대화하는 동선 */}
      <Suspense fallback={
        <div className="mb-12 space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse w-32" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
          <div className="h-20 bg-muted rounded-xl animate-pulse" />
        </div>
      }>
        <CommentsLoader postId={resolvedId} isGreeting={post.category === GREETING_CATEGORY} />
      </Suspense>

      {/* 가입 유도 — 댓글까지 본 사람에게 */}
      <PostCTA postId={resolvedId} postTitle={post.title} />

      {/* 관련글 추천 v2 — 댓글·가입유도 뒤 "다음에 읽기 좋은 이야기".
          후보 전체(24)를 넘기고 클라에서 본 글 제외 + 맥락×흥미도 점수화 상위 3개 노출. 하단 PostListBottom 유지. */}
      <NextPostsInline
        postId={resolvedId}
        boardSlug={boardSlug}
        currentCategory={post.category || null}
        currentTitle={post.title}
        currentPreview={post.preview ?? ''}
        currentBoardType={post.boardType}
        posts={related}
        crossBoardPosts={crossBoard}
      />

      {/* 하단 연속 읽기 */}
      <CoupangBanner preset="mobile" className="my-6 rounded-2xl overflow-hidden" />
      <Suspense fallback={<div className="h-[300px] animate-pulse bg-muted/50 rounded-2xl" />}>
        <PostListBottom
          boardType={board.boardType}
          boardSlug={boardSlug}
          excludePostId={resolvedId}
          displayName={board.displayName}
          mode="related"
          relatedPosts={related}
        />
      </Suspense>

      {/* 하단 애드센스 띠배너 (반응형 디스플레이) */}
      <NativeAdSlot slotId="community-detail-bottom" minHeight={230} fallback={<AdSenseUnit slotId={ADSENSE.POST_BOTTOM_BANNER} format="auto" className="rounded-2xl overflow-hidden mt-6" />} />
    </div>
  )
}
