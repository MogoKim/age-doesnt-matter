import type { Metadata } from 'next'
import PostWriteForm from '@/components/features/community/PostWriteForm'
import { getAllBoardConfigs } from '@/lib/queries/boards'

export const metadata: Metadata = {
  title: '글쓰기',
  description: '새로운 글을 작성합니다.',
}

interface PageProps {
  searchParams: Promise<{ board?: string }>
}

// 글쓰기 가능한 보드 타입 (MENOPAUSE: PR-1 — BoardConfig row 생성 후 보드 선택기에 노출됨)
const WRITABLE_BOARD_TYPES = ['STORY', 'HUMOR', 'LIFE2', 'MENOPAUSE']

export default async function WritePage({ searchParams }: PageProps) {
  // 로그인 확인을 여기서 하지 않는다 — 비회원도 폼을 열고 글을 쓸 수 있어야 한다.
  // 실제 차단은 저장할 때 createPost가 한다(첫 줄에서 세션 확인). 폼이 열리는 것과
  // 글이 저장되는 것은 다른 문제이고, 막아야 하는 쪽은 저장이다.
  // 글 수정은 이 라우트가 아니라 /community/[board]/[postId]/edit이고 거기 auth는 그대로다.
  const [{ board }, allBoards] = await Promise.all([
    searchParams,
    getAllBoardConfigs(),
  ])

  const writableBoards = allBoards
    .filter((b) => WRITABLE_BOARD_TYPES.includes(b.boardType))
    .map((b) => ({
      slug: b.slug,
      displayName: b.displayName,
      categories: b.categories,
    }))

  // URL searchParam이 유효하지 않은 slug일 경우 undefined로 처리
  const validSlugs = writableBoards.map((b) => b.slug)
  const validDefaultBoard = board && validSlugs.includes(board) ? board : undefined

  return (
    <>
      {/* 글쓰기 전용 레이아웃: GNB(header)와 Footer 모두 숨김, 전용 헤더 사용 */}
      <style>{`
        header { display: none !important; }
        nav[aria-label="주요 메뉴"] { display: none !important; }
        footer { display: none !important; }
      `}</style>
      <div className="max-w-[720px] mx-auto px-4 pt-[52px] pb-6 md:px-6 md:pb-8">
        <PostWriteForm
          defaultBoard={validDefaultBoard}
          boards={writableBoards}
        />
      </div>
    </>
  )
}
