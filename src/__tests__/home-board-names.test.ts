import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'

/**
 * 홈 섹션 제목에 게시판 이름을 글자로 박아두지 않는다.
 *
 * 회귀 이력: 홈 "사는 이야기" 섹션 제목만 문자열로 박혀 있어서,
 * 어드민에서 게시판명을 "사는이야기"로 바꿔도 홈만 옛 이름으로 남았다.
 * 같은 화면에서 아이콘 메뉴는 "사는이야기", 섹션 제목은 "사는 이야기"가 됐다.
 * 같은 파일 안에서 글카드 라벨(45행)은 이미 상수를 쓰고 있었는데 제목만 빠져 있었다.
 */

const root = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

describe('홈 섹션 제목 — 게시판명 하드코딩 금지', () => {
  it('사는이야기 섹션이 BOARD_DISPLAY_NAMES를 쓴다', () => {
    const src = read('src/components/features/home/StoriesSection.tsx')
    expect(src).toMatch(/\{BOARD_DISPLAY_NAMES\.STORY\}/)
  })

  it('홈 섹션 어디에도 구표기 "사는 이야기"(공백)가 없다', () => {
    for (const f of ['StoriesSection.tsx', 'HumorSection.tsx', 'TrendingSection.tsx', 'MagazineSection.tsx']) {
      const src = read(`src/components/features/home/${f}`)
      // 주석/회귀 설명에 등장하는 건 허용 — JSX 텍스트 노드로 남아 있으면 안 된다
      const jsxText = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(jsxText, f).not.toMatch(/^\s*사는 이야기\s*$/m)
    }
  })

  it('상수가 홈·게시판 선택·글쓰기 폼이 기대하는 값이다', () => {
    expect(BOARD_DISPLAY_NAMES.STORY).toBe('사는이야기')
    expect(BOARD_DISPLAY_NAMES.LIFE2).toBe('2막준비')
    expect(BOARD_DISPLAY_NAMES.HUMOR).toBe('웃음방')
    expect(BOARD_DISPLAY_NAMES.MENOPAUSE).toBe('갱년기톡')
  })
})
