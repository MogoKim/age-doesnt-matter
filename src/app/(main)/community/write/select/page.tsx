import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllBoardConfigs } from '@/lib/queries/boards'
import { WRITE_BOARDS, pickWriteChips } from '@/lib/write-boards'
import WriteBoardSelectList, { type WriteBoardItem } from '@/components/features/community/WriteBoardSelectList'

export const metadata: Metadata = {
  title: '글쓰기 — 게시판 선택',
  description: '어떤 게시판에 글을 쓸지 고릅니다.',
  // 글을 쓰러 가는 중간 화면이라 검색 결과에 보여줄 내용이 없다
  robots: { index: false, follow: false },
}

/**
 * 게시판 선택 화면 — 홈에서 글쓰기를 누르면 여기로 온다.
 *
 * 홈에는 게시판이 정해져 있지 않다. 이 화면 없이 /community/write로 바로 보내면
 * 폼이 아무 안내 없이 첫 번째 게시판을 골라버린다(그 순서도 DB 조회 순서라 보장이 없다) —
 * 사용자는 "2막준비 글쓰기"라고 쓰인 화면에서 갱년기 이야기를 쓰게 된다.
 *
 * 게시판 안에서 누른 글쓰기는 이미 board를 알고 있어 여기를 거치지 않는다
 * (FAB·목록 글쓰기 버튼이 곧장 /community/write?board=…로 간다 — 이 PR은 그 경로를 건드리지 않는다).
 *
 * 로그인 게이트는 여기 두지 않는다(middleware PROTECTED_EXCEPTIONS). 게시판 목록은 가릴 내용이
 * 아니고, 여기서 막으면 홈 CTA가 로그인 유도 문구를 보여줄 기회 없이 로그인 페이지로 튕긴다.
 * 글쓰기 폼(/community/write)은 그대로 잠겨 있다.
 */
export default async function WriteBoardSelectPage() {
  // 카테고리를 못 읽어도 게시판 선택 자체는 되어야 한다 — 칩 없이 그린다.
  let configs: Awaited<ReturnType<typeof getAllBoardConfigs>> = []
  try {
    configs = await getAllBoardConfigs()
  } catch {
    configs = []
  }

  const byType = new Map(configs.map((c) => [c.boardType, c]))
  const items: WriteBoardItem[] = WRITE_BOARDS
    // 운영에서 내린 게시판은 뺀다(눌러도 글을 쓸 수 없다). 조회 자체가 실패했으면 거르지 않는다.
    .filter((meta) => configs.length === 0 || byType.has(meta.boardType))
    .map((meta) => ({ ...meta, chips: pickWriteChips(byType.get(meta.boardType)?.categories ?? []) }))

  return (
    <>
      {/* 글쓰기 전용 화면: GNB·아이콘메뉴·Footer 숨김 (/community/write와 같은 방식) */}
      <style>{`
        header { display: none !important; }
        nav[aria-label="주요 메뉴"] { display: none !important; }
        footer { display: none !important; }
      `}</style>

      {/* 상단바 — 글쓰기 폼 헤더와 같은 높이(52px)·같은 토큰 */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-[52px] items-center justify-center border-b border-border bg-card px-4">
        <Link
          href="/"
          aria-label="닫기"
          className="absolute left-2 flex h-[52px] w-[52px] items-center justify-center text-muted-foreground no-underline [-webkit-tap-highlight-color:transparent]"
        >
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <span className="text-body font-bold text-foreground">글쓰기</span>
      </div>

      <div className="mx-auto max-w-[560px] pt-[52px]">
        <div className="px-5 pb-4 pt-6">
          {/* 장식성 헤드라인 — 한 줄에 들어가는 게 확인된 크기라 px로 고정한다 */}
          <h1 className="font-extrabold leading-[1.34] text-foreground break-keep" style={{ fontSize: '22px' }}>
            어떤 이야기인가요?
          </h1>
          <p className="mt-1.5 text-muted-foreground break-keep" style={{ fontSize: 'var(--text-caption)' }}>
            게시판을 고르면 주제는 다음에 정해요
          </p>
        </div>

        <WriteBoardSelectList items={items} />
      </div>
    </>
  )
}
