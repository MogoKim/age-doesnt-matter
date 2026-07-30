import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { getBoardConfig } from '@/lib/queries/boards'
import { getCachedBoardPage } from '@/lib/queries/posts'
import BoardFilter from '@/components/features/community/BoardFilter'
import SortToggle from '@/components/features/community/SortToggle'
import BoardViewTracker from '@/components/features/community/BoardViewTracker'
import BoardPostListClient from '@/components/features/community/BoardPostListClient'
import PwaInlineBanner from '@/components/common/PwaInlineBanner'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb'
import type { BoardType } from '@/generated/prisma/client'

interface PageProps {
  params: Promise<{ boardSlug: string }>
}

const CI_DUMMY_DB = process.env.CI === 'true' && process.env.DATABASE_URL?.includes('localhost:5432/dummy')

const STATIC_BOARD_CONFIGS: Record<string, {
  slug: string
  boardType: BoardType
  displayName: string
  seoTitle: string
  description: string
  categories: string[]
}> = {
  stories: {
    slug: 'stories',
    boardType: 'STORY',
    displayName: '사는이야기',
    seoTitle: '사는이야기 — 갱년기·가족 고민 나눔',
    description: '갱년기 우울, 부부·자녀 고민, 살림까지 — 40대 50대 60대 여성이 진짜 속마음을 나누는 곳.',
    categories: ['전체'],
  },
  humor: {
    slug: 'humor',
    boardType: 'HUMOR',
    displayName: '웃음방',
    seoTitle: '웃음방 — 중년 유머·일상 짤',
    description: '40대 50대 60대 여성의 하루에 웃음 한 스푼. 재밌는 짤·유머·일상을 같이 나눠요.',
    categories: ['전체'],
  },
  life2: {
    slug: 'life2',
    boardType: 'LIFE2',
    displayName: '2막준비',
    seoTitle: '2막준비 — 은퇴·노후 준비',
    description: '은퇴·노후 준비, 새 취미와 일까지 — 자식 다 키운 40대 50대 60대 여성의 인생 2막.',
    categories: ['전체'],
  },
  menopause: {
    slug: 'menopause',
    boardType: 'MENOPAUSE',
    displayName: '갱년기톡',
    seoTitle: '갱년기톡 — 갱년기·완경 경험 나눔',
    description: '안면홍조·불면·감정 기복까지, 나만 겪는 게 아니에요. 40대 50대 60대 여성이 갱년기 몸과 마음의 변화를 편하게 나누는 곳.',
    categories: ['전체'],
  },
}

// ISR Writes 절감(30→300s): 글 작성 시 revalidateTag('community-board-page')가 즉시 무효화
export const revalidate = 300
const SHOW_COMMUNITY_CATEGORY_FILTER = false
const SHOW_COMMUNITY_SORT_TOGGLE = true

/**
 * 주제 허브(/topic/*)로 가는 목록 내 안내 행. 해당 boardSlug에서만 렌더한다.
 * DB 글이 아니라 정적 문구다 — 허브는 여러 게시판·매거진 글을 주제별로 묶는 SEO 페이지라
 * 게시글로 만들 대상이 아니고, 만들면 목록 정렬·통계에 섞인다.
 */
const TOPIC_HUB: Record<string, { href: string; title: string; preview: string } | undefined> = {
  menopause: {
    href: '/topic/menopause',
    title: '갱년기 이야기, 주제별로 모아봤어요',
    preview: '폐경·완경, 몸의 변화, 감정과 관계, 병원 선택 — 우나어님들이 자주 나눈 이야기를 모았습니다',
  },
  life2: {
    href: '/topic/second-act',
    title: '재취업과 은퇴 후 돈 이야기, 한곳에 모아봤어요',
    preview: '다시 일하기, 퇴직금·연금, 건강보험과 생활비 — 인생 2막 이야기를 주제별로 정리했습니다',
  },
}

export function generateStaticParams() {
  return [
    { boardSlug: 'stories' },
    { boardSlug: 'humor' },
    { boardSlug: 'life2' },
    { boardSlug: 'menopause' },
  ]
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { boardSlug } = await params
  // getBoardConfig 예외만 try로 격리 — notFound()는 내부적으로 예외를 던지므로 catch에 삼켜지면 무력화된다
  let boardOrNull = null
  try {
    boardOrNull = await getBoardConfig(boardSlug)
  } catch {
    return { title: '게시판' }
  }
  if (!boardOrNull) notFound() // 미존재 board — metadata 단계 404 (스트리밍 전이라 상태코드 확정)
  try {
    const board = boardOrNull
    const canonical = boardSlug === 'magazine'
      ? '/magazine'
      : boardSlug === 'jobs'
        ? '/jobs'
        : `/community/${boardSlug}`

    // 검색 노출 설명은 코드 정의(STATIC)를 우선 — 정체성 카피 일관 관리, DB 미동기화 방어
    const staticDesc = STATIC_BOARD_CONFIGS[boardSlug]?.description
    return {
      title: STATIC_BOARD_CONFIGS[boardSlug]?.seoTitle ?? board.displayName,
      description: staticDesc ?? board.description,
      alternates: { canonical },
    }
  } catch {
    return { title: '게시판' }
  }
}

function getBoardFaqJsonLd(boardSlug: string): object | null {
  const faqs: Record<string, Array<{ q: string; a: string }>> = {
    stories: [
      { q: '50대 외로움 어떻게 극복하나요?', a: '우나어 사는이야기에서 비슷한 처지의 50·60대 분들과 일상을 나누면 외로움이 줄어들어요. 댓글 하나에도 "나만 그런 게 아니구나" 하는 위안이 됩니다.' },
      { q: '갱년기 감정 기복이 심한데 정상인가요?', a: '네, 50대 갱년기에 감정 기복은 매우 흔한 증상입니다. 호르몬 변화로 생기는 자연스러운 반응으로, 우나어 사는이야기에서 같은 경험을 나누는 분들을 만날 수 있어요.' },
      { q: '중년 부부 대화가 없어요, 어떻게 해야 할까요?', a: '은퇴 후 또는 자녀 독립 후 부부 대화가 줄어드는 것은 중장년 부부에서 흔한 문제입니다. 우나어 사는이야기 게시판에서 비슷한 상황의 분들이 경험과 해결 방법을 활발히 나누고 있어요.' },
    ],
    life2: [
      { q: '50대 퇴직 후 무엇을 해야 하나요?', a: '우나어 2막준비 게시판에서 퇴직 후 창업, 재취업, 취미 활동, 봉사 등 다양한 인생 2막 사례를 먼저 경험한 분들과 나눌 수 있습니다.' },
      { q: '은퇴 준비는 몇 살부터 시작해야 하나요?', a: '전문가들은 보통 50대 초반부터 은퇴 준비를 시작하길 권장합니다. 우나어 2막준비에서는 기초연금, 퇴직연금, 건강보험 등 실질적인 준비 방법을 경험자들에게 직접 물어볼 수 있어요.' },
      { q: '노후 준비를 혼자 하기 어려운데 어떻게 하나요?', a: '우나어 2막준비 게시판에는 노후 준비를 함께 고민하는 동료들이 있습니다. 재정 계획, 건강 관리, 새로운 도전 등 다양한 이야기를 나누며 혼자가 아님을 느낄 수 있어요.' },
    ],
    humor: [
      { q: '50대 60대가 공감하는 유머는 어디서 보나요?', a: '우나어 웃음방에는 우리 또래만 이해하는 일상 유머, 중년 생활의 공감 포인트가 가득합니다. 남편 퇴직 후 일상, 갱년기 증상, 폰 사용 실수담 등 웃으면서 공감할 수 있어요.' },
      { q: '중년 일상이 재미없어요, 어떻게 하면 될까요?', a: '우나어 웃음방에서 우리 또래가 올리는 공감 유머글을 보면 일상의 무게가 조금 가벼워져요. 비슷한 나이의 사람들이 같은 상황을 웃음으로 넘기는 것을 보면 기분이 나아집니다.' },
    ],
    // 갱년기톡: 경험·공감 중심 답변 — 의료 단정 금지, 병원 상담 권유 수준까지만 (YMYL 안전)
    menopause: [
      { q: '갱년기 증상은 나만 심한 건가요?', a: '아니에요. 안면홍조, 식은땀, 불면, 감정 기복은 40대 50대 60대 여성이 아주 흔하게 겪는 변화입니다. 우나어 갱년기톡에서 같은 시기를 지나는 분들의 경험담을 읽어보면 "나만 그런 게 아니구나" 하고 마음이 놓여요.' },
      { q: '갱년기에 감정 기복과 우울감이 심해요, 어떻게 하나요?', a: '호르몬 변화로 감정이 널뛰는 것은 자연스러운 과정이에요. 우나어 갱년기톡에서 비슷한 경험을 나눈 분들의 이야기와 생활 관리법을 볼 수 있습니다. 다만 일상이 어려울 정도로 힘들다면 병원 상담을 함께 받아보시길 권해요.' },
      { q: '완경 후 몸 관리는 어떻게 시작하나요?', a: '우나어 갱년기톡에서는 완경 전후를 지나온 또래들이 운동, 식단, 검진 후기 같은 실제 경험을 나눕니다. 사람마다 몸이 다르니 경험담을 참고하되, 구체적인 치료나 호르몬 관련 결정은 의료진과 상의하는 것이 좋아요.' },
    ],
  }

  const items = faqs[boardSlug]
  if (!items) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

function PostListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl p-5 border border-border animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4 mb-3" />
          <div className="h-3 bg-muted rounded w-full mb-2" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}

async function getBoardForPage(boardSlug: string) {
  try {
    const board = await getBoardConfig(boardSlug)
    if (board) return board
  } catch (error) {
    if (!CI_DUMMY_DB) throw error
  }
  return STATIC_BOARD_CONFIGS[boardSlug] ?? null
}

async function getInitialBoardData(boardType: BoardType) {
  try {
    return await getCachedBoardPage(boardType, 'all', 'latest')
  } catch (error) {
    if (!CI_DUMMY_DB) throw error
    return { posts: [], total: 0 }
  }
}

export default async function BoardListPage({ params }: PageProps) {
  const { boardSlug } = await params
  if (boardSlug === 'magazine') permanentRedirect('/magazine')
  if (boardSlug === 'jobs') permanentRedirect('/jobs')

  const board = await getBoardForPage(boardSlug)
  if (!board) notFound()

  const initialData = await getInitialBoardData(board.boardType)
  const topicHub = TOPIC_HUB[boardSlug]

  const boardFaqJsonLd = getBoardFaqJsonLd(boardSlug)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: '홈', path: '/' },
    { name: board.displayName, path: `/community/${boardSlug}` },
  ])

  return (
    <div className="max-w-[960px] mx-auto px-4 pt-4 pb-6 md:px-6 md:pt-4 md:pb-8">
      {boardFaqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(boardFaqJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* GA4 게시판 조회 이벤트 */}
      <BoardViewTracker boardType={board.boardType} boardSlug={boardSlug} />
      <h1 className="sr-only">{board.displayName}</h1>

      {/* PWA 인라인 배너 (미설치 + 비차단 환경에서만 노출) */}
      <PwaInlineBanner />

      {/* 카테고리 필터는 임시 숨김, 정렬은 유지. query 기반 접근은 유지한다.
          하단 border는 목록의 시작선 역할 — 이전에는 선 없이 여백 8px뿐이라
          정렬 칩이 목록 위에 떠 있고 목록이 어디서 시작하는지 불분명했다.
          목록 첫 행에 border-top을 주는 방식은 빈 상태·검색 결과 없음에서
          선만 남아 떠 보이므로, 헤더 쪽에 붙인다. */}
      {(SHOW_COMMUNITY_CATEGORY_FILTER || SHOW_COMMUNITY_SORT_TOGGLE) && (
        <div
          className={`flex items-center flex-wrap gap-2 border-b border-border ${
            SHOW_COMMUNITY_CATEGORY_FILTER ? 'justify-between' : 'justify-end'
          }`}
        >
          {SHOW_COMMUNITY_CATEGORY_FILTER && board.categories.length > 1 && (
            <Suspense fallback={null}>
              <BoardFilter categories={board.categories} boardSlug={boardSlug} />
            </Suspense>
          )}
          {SHOW_COMMUNITY_SORT_TOGGLE && (
            <Suspense fallback={null}>
              <SortToggle />
            </Suspense>
          )}
        </div>
      )}

      {/* 주제 허브 안내 — 목록의 첫 행 자리에 게시글과 같은 구조로 둔다.
          이전에는 정렬 칩 위에 rounded-lg 카드(높이 92px)로 있어서, 375px 첫 화면에서
          게시글이 2개밖에 보이지 않았다(실측: 첫 게시글 top 315px). 광고처럼 읽혀
          건너뛰게 되는 것도 문제였다.
          목록 안(BoardPostListClient)이 아니라 밖에 두는 이유: 그 컴포넌트는 client이고
          정렬·페이지·검색이 바뀌면 /api로 목록을 통째로 교체한다. 배열에 끼워 넣으면
          응답에 없는 항목이라 사라지거나 병합 로직이 필요하다. 여기 두면 정렬 탭과
          무관하게 항상 같은 자리에 남고, 서버 HTML에 <a>가 그대로 나온다(내부링크 유지).
          위 정렬 칩 div가 border-b라서 이 행이 목록의 첫 줄로 자연스럽게 이어진다. */}
      {topicHub && (
        <Link
          href={topicHub.href}
          className="block border-b border-border py-[18px] no-underline text-inherit transition-colors hover:bg-muted/40"
        >
          <h2 className="text-body font-bold text-foreground m-0 line-clamp-2 leading-[1.4]">
            {topicHub.title}
          </h2>
          <p className="text-caption text-muted-strong m-0 mt-1.5 line-clamp-2 leading-[1.6]">
            {topicHub.preview}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-subtle">
            <span>우나어 편집팀</span>
            <span aria-hidden="true">·</span>
            <span>모아보기</span>
          </div>
        </Link>
      )}

      {/* 게시글 목록 + 페이지네이션 + 검색 — 스트리밍 */}
      <Suspense fallback={<PostListSkeleton />}>
        <BoardPostListClient
          boardType={board.boardType}
          boardSlug={boardSlug}
          initialPosts={initialData.posts}
          initialTotal={initialData.total}
        />
      </Suspense>
    </div>
  )
}
