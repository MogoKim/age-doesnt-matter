/**
 * Google Sheet scraper board routing.
 *
 * Keep this as the single source of truth for sheet-tab -> board routing.
 * The scraper intentionally supports only directly assigned sheet tabs here;
 * automatic menopause classification from other tabs belongs to a later dry-run.
 */

export type SheetBoardType = 'STORY' | 'HUMOR' | 'LIFE2' | 'MENOPAUSE'

export interface SheetTabConfig {
  boardType: SheetBoardType
  isFeatured: boolean
  isDawn?: boolean
}

export const SHEET_TAB_TO_BOARD: Record<string, SheetTabConfig> = {
  '사는이야기': { boardType: 'STORY', isFeatured: false },
  '웃음방': { boardType: 'HUMOR', isFeatured: false },
  '사는이야기_화제성': { boardType: 'STORY', isFeatured: true },
  '웃음방_화제성': { boardType: 'HUMOR', isFeatured: true },
  '2막준비': { boardType: 'LIFE2', isFeatured: false },
  '2막준비_화제성': { boardType: 'LIFE2', isFeatured: true },
  '갱년기톡': { boardType: 'MENOPAUSE', isFeatured: false },
  '갱년기톡_화제성': { boardType: 'MENOPAUSE', isFeatured: true },
  '사는이야기_새벽': { boardType: 'STORY', isFeatured: false, isDawn: true },
}

export const SHEET_BOARD_DEFAULT_CATEGORY: Record<SheetBoardType, string> = {
  STORY: '자유수다',
  HUMOR: '기타',
  LIFE2: '은퇴준비',
  MENOPAUSE: '나만 이런가요',
}

export function getSheetBoardSlug(boardType: SheetBoardType): string {
  switch (boardType) {
    case 'STORY':
      return 'stories'
    case 'HUMOR':
      return 'humor'
    case 'LIFE2':
      return 'life2'
    case 'MENOPAUSE':
      return 'menopause'
    default: {
      const unreachable: never = boardType
      throw new Error(`Unsupported sheet board type: ${unreachable}`)
    }
  }
}
