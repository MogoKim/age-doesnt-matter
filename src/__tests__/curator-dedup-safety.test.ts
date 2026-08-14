import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * 중복 발행 안전선 — 제목 리라이팅 회귀 고정 (2026-08-14)
 *
 * ## 왜 이 테스트가 있나
 *
 * Sonnet 제목 리라이팅을 붙이면 Post.title이 바뀐다. 처음에는 "제목이 바뀌면 같은 원문이
 * 다른 제목으로 중복 발행된다"고 우려했으나, 코드를 읽어보니 **틀린 걱정이었다.**
 *
 * 같은 원문 재발행을 막는 것은 제목이 아니라 **`usedAt` 게이트**다.
 *   · 후보 조회 where 절에 `usedAt: null`  (content-curator.ts · popular-curator.ts)
 *   · 발행 성공 시 트랜잭션 안에서 `usedAt` 마킹
 * → 제목을 아무리 바꿔도 이미 발행된 CafePost는 후보로 다시 뽑히지 않는다.
 *
 * 제목 기반 판정(명사 교집합 + 편집거리)의 역할은 **다른 원문끼리 주제가 겹칠 때**를 막는
 * 보조 방어다. 코드 주석도 "크로스소스 중복 방지"라고 밝히고 있다.
 *
 * ## 이 테스트가 지키는 것
 *
 * 리팩토링·리라이팅 도입 과정에서 **`usedAt` 게이트가 조용히 빠지면 즉시 실패**하게 만든다.
 * 그게 빠지는 순간 같은 원문이 매 회차 다시 뽑혀 중복 발행이 시작된다.
 *
 * ⚠️ 중복 로직 자체를 리팩토링하지 않는다. 현재 구조를 고정하는 것이 목적이다.
 * ⚠️ 소스 문자열 검사인 이유: 후보 조회는 Prisma where 절이라 순수 함수로 분리돼 있지 않다.
 *    실제 DB를 붙이지 않고 계약을 고정할 수 있는 가장 가벼운 방법이다.
 */

const AGENTS = resolve(__dirname, '../../agents/cafe')
const read = (f: string) => readFileSync(resolve(AGENTS, f), 'utf8')

describe('중복 발행 안전선 — usedAt 게이트가 핵심 (제목 아님)', () => {
  const contentCurator = read('content-curator.ts')
  const popularCurator = read('popular-curator.ts')

  it('content-curator 후보 조회 base에 usedAt: null 이 있다', () => {
    // 이게 빠지면 이미 발행된 원문이 다시 후보로 올라온다 = 중복 발행
    expect(contentCurator).toContain('usedAt: null')
  })

  it('content-curator가 발행 성공 시 usedAt을 마킹한다', () => {
    // 마킹이 빠지면 usedAt: null 게이트가 무의미해진다
    expect(contentCurator).toContain('data: { usedAt: new Date() }')
  })

  it('popular-curator 후보 조회에도 usedAt: null 이 있다', () => {
    expect(popularCurator).toContain('usedAt: null')
  })

  it('popular-curator도 발행 시 usedAt을 마킹한다', () => {
    expect(popularCurator).toContain('usedAt: new Date()')
  })

  it('양쪽 발행 경로가 Post에 cafePostId를 남긴다 (원문 역추적 = rollback 기반)', () => {
    // 제목을 바꾸더라도 어느 원문에서 왔는지 추적할 수 있어야 한다
    expect(contentCurator).toContain('cafePostId:')
    expect(popularCurator).toContain('cafePostId: post.id')
  })
})

describe('중복 발행 — 제목 기반 판정은 보조 방어 (주제 중복용)', () => {
  const contentCurator = read('content-curator.ts')

  it('제목 판정은 "크로스소스 중복 방지" 목적임이 코드에 남아 있다', () => {
    // 같은 원문 재발행 방지가 아니라, 다른 원문끼리 주제가 겹치는 것을 막는 장치다.
    // 리라이팅으로 이 축이 약해져도 같은 원문 중복은 usedAt이 막는다.
    expect(contentCurator).toContain('크로스소스 중복 방지')
  })

  it('명사 교집합·편집거리 2중 판정 구조가 유지된다', () => {
    // 리라이팅하면 편집거리 축은 약해지지만 명사 교집합은 부분적으로 남는다.
    // 둘 중 하나라도 사라지면 주제 중복 방어가 크게 무너지므로 고정한다.
    expect(contentCurator).toContain('editDistance')
    expect(contentCurator).toContain('toNouns')
    expect(contentCurator).toContain('DUPLICATE_TITLE')
  })
})

describe('제목 리라이팅 도입 시 지켜야 할 계약', () => {
  const gate = read('title-rewrite-gate.ts')

  it('후보 gate는 발행을 차단하지 않는다고 명시돼 있다', () => {
    // 이 gate가 발행 차단으로 오해되면 콘텐츠 공급이 끊긴다
    expect(gate).toContain('발행을 차단하지 않는다')
  })

  it('후보 gate가 아직 어디에도 연결되지 않았음이 명시돼 있다', () => {
    expect(gate).toContain('아직 어디에도 연결되지 않았다')
  })

  it('content-curator·popular-curator가 아직 gate를 호출하지 않는다 (운영 영향 0)', () => {
    const cc = read('content-curator.ts')
    const pc = read('popular-curator.ts')
    expect(cc).not.toContain('title-rewrite-gate')
    expect(cc).not.toContain('evaluateTitleRewriteCandidate')
    expect(pc).not.toContain('title-rewrite-gate')
    expect(pc).not.toContain('evaluateTitleRewriteCandidate')
  })
})
