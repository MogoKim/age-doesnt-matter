import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  CAFE_CONFIGS,
  PUBLISHABLE_CAFE_IDS,
  SHADOW_CAFE_IDS,
  isShadowSource,
} from '../../agents/cafe/config'

/**
 * popular-curator — shadow source 발행 차단 (2026-08-15)
 *
 * ## 왜 이 테스트가 있나
 *
 * shadow는 "수집해서 관찰하되 고객에게는 절대 발행하지 않는" 단계다
 * (사다리: shadow → publishable → core → production).
 * content-curator는 이 계약을 후보 필터에서 지키고 있었지만,
 * **popular-curator에는 cafeId 필터가 아예 없었다.** 인기글 lane은 shadow든 아니든
 * `isPopular: true`이기만 하면 그대로 발행 후보가 됐다.
 *
 * 사고가 나지 않은 이유는 방어가 아니라 **우연**이었다.
 * `syncPopularPosts`(crawler.ts)는 `cafe.boards`에서 "인기글" 게시판을 찾지 못하면
 * 스킵하는데, 인기글 board가 production 카페 한 곳에만 정의돼 있었다.
 * 즉 `config.ts`에 `{ name: '인기글', isPopular: true }` 한 줄을 추가하는 순간
 * shadow 카페 글이 곧바로 고객에게 발행됐을 것이다.
 *
 * ## 이 테스트가 지키는 것
 *
 * 1. popular-curator 후보 쿼리의 allowlist가 조용히 빠지면 즉시 실패한다.
 * 2. content-curator 쪽 동일 계약도 함께 고정한다(두 lane의 방어 수준 비대칭 방지).
 * 3. shadow 카페에 인기글 board가 추가되면 실패한다 — 1차 방어선이 무너지는 순간을 알린다.
 *
 * ⚠️ 수집은 막지 않는다. 발행 후보에서만 제외한다. shadow 관찰은 계속돼야
 *    승격 판단(발행 후보 품질·본문 길이·광고 비율)이 가능하다.
 * ⚠️ 소스 문자열 검사인 이유: 후보 조회가 Prisma where 절이라 순수 함수로 분리돼 있지 않다.
 *    실제 DB 없이 계약을 고정하는 가장 가벼운 방법이다(curator-dedup-safety.test.ts와 같은 방식).
 */

const AGENTS = resolve(__dirname, '../../agents/cafe')
const read = (f: string) => readFileSync(resolve(AGENTS, f), 'utf8')

describe('popular-curator — shadow source 발행 차단', () => {
  const src = read('popular-curator.ts')

  it('후보 쿼리에 PUBLISHABLE_CAFE_IDS allowlist가 있다', () => {
    expect(src).toContain('cafeId: { in: PUBLISHABLE_CAFE_IDS }')
  })

  it('PUBLISHABLE_CAFE_IDS를 config에서 import한다', () => {
    expect(src).toMatch(/import \{[^}]*PUBLISHABLE_CAFE_IDS[^}]*\} from '\.\/config\.js'/)
  })

  it('allowlist가 후보 조회 where 절 안에 있다 (다른 곳에 떠 있지 않다)', () => {
    // rawCandidates 선언 ~ orderBy 사이 = where 블록
    const start = src.indexOf('const rawCandidates = await prisma.cafePost.findMany({')
    expect(start).toBeGreaterThan(-1)
    const whereBlock = src.slice(start, src.indexOf('orderBy', start))
    expect(whereBlock).toContain('cafeId: { in: PUBLISHABLE_CAFE_IDS }')
    // 같은 where에 usedAt 게이트도 살아 있어야 한다(중복 발행 방어 — curator-dedup-safety와 짝)
    expect(whereBlock).toContain('usedAt: null')
  })

  it('sourceStageOfCafe 로깅은 유지된다 (BotLog refSourceStage)', () => {
    expect(src).toContain('sourceStageOfCafe')
    expect(src).toContain('refSourceStage')
  })

  it('수집 차단이 아니다 — popular-curator는 crawler 수집 경로를 건드리지 않는다', () => {
    expect(src).not.toContain('syncPopularPosts')
  })
})

describe('content-curator — 동일한 발행 가능 source 계약이 남아 있다', () => {
  const src = read('content-curator.ts')

  it('PUBLISHABLE_CAFE_IDS 계약이 유지된다', () => {
    expect(src).toContain('PUBLISHABLE_CAFE_IDS')
  })

  it('SHADOW_CAFE_IDS 명시 제외도 유지된다', () => {
    expect(src).toContain('SHADOW_CAFE_IDS')
  })
})

describe('발행 가능 source 상수 — shadow가 allowlist로 새지 않는다', () => {
  it('SHADOW_CAFE_IDS ∩ PUBLISHABLE_CAFE_IDS = 0', () => {
    const overlap = SHADOW_CAFE_IDS.filter(id => PUBLISHABLE_CAFE_IDS.includes(id))
    expect(overlap).toEqual([])
  })

  it('PUBLISHABLE_CAFE_IDS의 모든 카페는 shadow가 아니다', () => {
    for (const id of PUBLISHABLE_CAFE_IDS) {
      const cafe = CAFE_CONFIGS.find(c => c.id === id)
      expect(cafe, `PUBLISHABLE_CAFE_IDS의 ${id}가 CAFE_CONFIGS에 없다`).toBeDefined()
      expect(isShadowSource(cafe!), `${id}가 shadow인데 발행 allowlist에 있다`).toBe(false)
    }
  })
})

describe('1차 방어선 — shadow 카페에는 인기글(isPopular) board가 없다', () => {
  /**
   * 이 테스트가 깨지면 shadow 카페 글에 isPopular=true가 붙기 시작한다는 뜻이다.
   * 2차 방어(위 allowlist)가 발행은 막아주지만, 그 board를 추가한 것이
   * 의도된 승격인지 실수인지 여기서 한 번 멈춰 확인해야 한다.
   */
  it('sourceStage=shadow 카페의 board에 isPopular가 없다', () => {
    for (const cafe of CAFE_CONFIGS.filter(isShadowSource)) {
      const popularBoards = cafe.boards.filter(b => b.isPopular).map(b => b.name)
      expect(
        popularBoards,
        `shadow 카페 ${cafe.id}에 인기글 board가 생겼다: ${popularBoards.join(', ')} — ` +
          '승격 의도라면 sourceStage를 먼저 올려야 한다',
      ).toEqual([])
    }
  })
})
