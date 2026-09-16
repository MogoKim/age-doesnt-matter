/**
 * 캐시 무효화·실고객 판별 계약 — Foundation 3.0 (A3·A4).
 *
 * ── A3. revalidateServicePaths 는 순수 함수가 아니다 ──────────
 *  **어떤 경로를 어떤 순서로 몇 번 부르느냐가 곧 동작**이다.
 *  콘텐츠·회원·신고 세 어드민 액션이 같은 코드를 복사해 쓰고 있었다 —
 *  한 곳만 경로를 늘리면 나머지 두 화면은 조용히 낡은 캐시를 계속 보여준다.
 *  값이 아니라 **호출 자체**를 검증한다.
 *
 * ── A4. isRealUser 는 방향이 문제였다 ────────────────────────
 *  알림·인사이트·리텐션 세 곳에 복사돼 있었다.
 *  정본을 관리자 쿼리에 두면 **알림 모듈이 관리자 쿼리에 의존**하게 되고,
 *  알림에 두면 관리자 쿼리가 푸시 타입까지 끌고 온다.
 *  그래서 의존성 0인 중립 모듈에 뒀다.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
// notify 는 import 만으로 Prisma 클라이언트를 만든다 — 재수출 호환만 보면 되므로 끊는다.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { revalidateServicePaths } from '@/lib/actions/admin/revalidate'
import { isRealUser } from '@/lib/real-user'

const SRC = resolve(process.cwd(), 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8')

beforeEach(() => revalidatePath.mockClear())

describe('A3 — revalidateServicePaths 의 경로·순서·횟수', () => {
  it('게시판과 글이 모두 있으면 5번, 정해진 순서로 부른다', () => {
    revalidateServicePaths('STORY', 'abc123')
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/community/stories',
      '/community/stories/abc123',
      '/',
      '/best',
      '/search',
    ])
    expect(revalidatePath).toHaveBeenCalledTimes(5)
  })

  it('글 식별자가 없으면 상세 경로를 부르지 않는다 — 4번', () => {
    revalidateServicePaths('STORY')
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/community/stories', '/', '/best', '/search',
    ])
  })

  it('게시판이 없으면 공통 3곳만 부른다', () => {
    revalidateServicePaths()
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/', '/best', '/search'])
  })

  it('모르는 게시판이면 목록 경로를 만들지 않는다 — 글 식별자가 있어도', () => {
    revalidateServicePaths('NOT_A_BOARD', 'abc123')
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual(['/', '/best', '/search'])
  })

  it('null·빈 문자열 게시판도 공통 3곳만', () => {
    revalidateServicePaths(null, 'abc123')
    revalidateServicePaths('', 'abc123')
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/', '/best', '/search', '/', '/best', '/search',
    ])
  })

  it('공통 3곳은 어떤 경우에도 항상 마지막에 이 순서로 붙는다', () => {
    const cases: Array<() => void> = [
      () => revalidateServicePaths(),
      () => revalidateServicePaths('STORY'),
      () => revalidateServicePaths('STORY', 'x'),
      () => revalidateServicePaths('NOPE', 'x'),
      () => revalidateServicePaths(null, null),
    ]
    for (const run of cases) {
      revalidatePath.mockClear()
      run()
      expect(revalidatePath.mock.calls.slice(-3).map((c) => c[0])).toEqual(['/', '/best', '/search'])
    }
  })

  it('🔴 서버 액션으로 열리지 않는다 — 파일에 use server 가 없다', () => {
    // 붙는 순간 export 가 브라우저에서 호출 가능한 엔드포인트가 된다.
    expect(read('lib/actions/admin/revalidate.ts')).not.toMatch(/^\s*['"]use server['"]/m)
  })

  it('세 어드민 액션이 복사본 대신 공용 모듈을 쓴다', () => {
    for (const f of ['lib/actions/admin/admin.content.ts', 'lib/actions/admin/admin.members.ts', 'lib/actions/admin/admin.reports.ts']) {
      const t = read(f)
      expect(t, `${f} 에 복사본이 남았다`).not.toMatch(/function revalidateServicePaths\s*\(/)
      expect(t, `${f} 가 공용 모듈을 import 하지 않는다`).toContain("from './revalidate'")
    }
  })
})

describe('A4 — isRealUser 판별', () => {
  it.each([
    ['1', true],
    ['12345', true],
    ['0', true],
    ['00012', true],
  ])('숫자 providerId %p → 실고객', (pid, expected) => {
    expect(isRealUser(pid)).toBe(expected)
  })

  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    ['  ', false],
    ['seed_01', false],
    ['seed-01', false],
    ['curator-3', false],
    ['bot-weekly', false],
    ['admin', false],
    ['12a', false],
    ['a12', false],
    ['1.5', false],
    ['-1', false],
    ['+1', false],
    ['1 2', false],
    ['١٢٣', false],       // 아라비아-인도 숫자 — ASCII 숫자가 아니다
    ['12\n', false],      // 개행이 붙으면 실고객이 아니다
  ])('%p → 봇/비회원', (pid, expected) => {
    expect(isRealUser(pid as string | null | undefined)).toBe(expected)
  })

  it('🔴 정본 모듈은 아무것도 import 하지 않는다', () => {
    const t = read('lib/real-user.ts')
    expect([...t.matchAll(/^\s*import\s/gm)]).toEqual([])
  })

  it('알림 모듈이 관리자 쿼리에 의존하지 않는다', () => {
    const t = read('lib/notify.ts')
    expect(t).not.toMatch(/from '@\/lib\/queries\/admin/)
    expect(t).toContain("from '@/lib/real-user'")
  })

  it('notify 의 기존 export 가 유지된다 (호환)', async () => {
    const mod = await import('@/lib/notify')
    expect(typeof mod.isRealUser).toBe('function')
    expect(mod.isRealUser('12345')).toBe(true)
    expect(mod.isRealUser('seed_1')).toBe(false)
  })

  it('복사본이 돌아오지 않았다', () => {
    for (const f of ['lib/queries/admin/admin.insights.ts', 'lib/queries/admin/admin.retention.ts', 'lib/notify.ts']) {
      expect(read(f), `${f} 에 복사본이 남았다`).not.toMatch(/const isRealUser\s*=/)
    }
  })
})
