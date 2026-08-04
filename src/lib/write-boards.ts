import type { ComponentType } from 'react'
import { IconEnergy, IconHeart, IconLife2, IconStories } from '@/components/icons'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'
import type { BoardTypeId } from '@/lib/board-registry'

/**
 * 글쓰기 가능한 게시판 메타 — 게시판 선택 화면(/community/write/select)의 단일 소스.
 *
 * 홈에는 게시판이 정해져 있지 않아서 "어디에 쓸지" 먼저 고르는 화면이 필요하다.
 * 그 화면이 쓰는 것들(순서·아이콘·색)을 여기 모아 둔다.
 *
 * 여기 두지 않는 것:
 *  - 표시명 → BOARD_DISPLAY_NAMES (홈 메뉴·글카드와 같은 표기를 써야 한다)
 *  - 카테고리 → DB BoardConfig.categories (운영 중 바뀌므로 코드에 박으면 안 된다)
 *  - 색 → globals.css의 --icon-* 변수 (IconMenu와 같은 값을 써야 한다)
 *
 * 순서는 홈 아이콘 메뉴(IconMenu)에서 글쓰기 가능한 것만 추린 것과 같다 —
 * 사용자가 홈에서 본 순서와 다르면 다른 목록으로 읽힌다.
 */

/** 아이콘 컴포넌트 — icons/index.tsx의 IconProps 중 여기서 쓰는 것만 */
type BoardIcon = ComponentType<{ size?: number; className?: string }>

export interface WriteBoardMeta {
  /** URL slug — /community/write?board={slug} */
  slug: string
  boardType: BoardTypeId
  /** 홈 메뉴와 같은 표기 (예: "사는이야기" — DB displayName은 "사는 이야기"라 다르다) */
  displayName: string
  Icon: BoardIcon
  /** 아이콘 타일 배경색 CSS 변수 — IconMenu와 동일 */
  bgVar: string
  /** 아이콘 선색 CSS 변수 — IconMenu와 동일 */
  strokeVar: string
}

export const WRITE_BOARDS: readonly WriteBoardMeta[] = [
  {
    slug: 'menopause',
    boardType: 'MENOPAUSE',
    displayName: BOARD_DISPLAY_NAMES.MENOPAUSE,
    Icon: IconHeart,
    bgVar: '--icon-meno-bg',
    strokeVar: '--icon-meno-stroke',
  },
  {
    slug: 'stories',
    boardType: 'STORY',
    displayName: BOARD_DISPLAY_NAMES.STORY,
    Icon: IconStories,
    bgVar: '--icon-life-bg',
    strokeVar: '--icon-life-stroke',
  },
  {
    slug: 'life2',
    boardType: 'LIFE2',
    displayName: BOARD_DISPLAY_NAMES.LIFE2,
    Icon: IconLife2,
    bgVar: '--icon-life2-bg',
    strokeVar: '--icon-life2-stroke',
  },
  {
    slug: 'humor',
    boardType: 'HUMOR',
    displayName: BOARD_DISPLAY_NAMES.HUMOR,
    Icon: IconEnergy,
    bgVar: '--icon-laugh-bg',
    strokeVar: '--icon-laugh-stroke',
  },
] as const

/** 글쓰기 가능한 slug 목록 — 베스트·매거진·내일찾기는 여기 없다(글을 쓰는 곳이 아니다) */
export const WRITE_BOARD_SLUGS: readonly string[] = WRITE_BOARDS.map((b) => b.slug)

/**
 * 대표 칩에서 빼는 카테고리.
 *
 * 칩 문구 자체는 DB에서 가져오지만, DB의 카테고리 **순서**는 글쓰기 유도 순서와 무관하다.
 * 그대로 앞에서 3개를 자르면 사는이야기가 "가입인사 · 건강 · 가족"이 되는데,
 * 글을 쓰러 온 사람에게 첫 줄로 보여줄 말이 아니다.
 * '전체'는 카테고리가 아니라 목록 필터, '기타'는 아무것도 설명하지 못한다.
 *
 * → 걸러내는 이름만 여기 두고, 문구는 계속 DB를 따른다(카테고리가 바뀌면 칩도 따라 바뀐다).
 */
export const WRITE_CHIP_EXCLUDED: readonly string[] = ['전체', '가입인사', '기타']

/**
 * 대표 칩은 최대 3개.
 * 4개를 넣으면 375px·글씨 크게에서 두 줄로 넘어가 항목이 들쭉날쭉해진다.
 */
export const WRITE_CHIP_LIMIT = 3

/** 게시판 카테고리에서 대표 칩을 고른다 */
export function pickWriteChips(categories: readonly string[]): string[] {
  return categories.filter((c) => !WRITE_CHIP_EXCLUDED.includes(c)).slice(0, WRITE_CHIP_LIMIT)
}
