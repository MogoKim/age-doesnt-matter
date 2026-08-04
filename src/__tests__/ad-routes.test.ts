import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  LIST_HEADER_ROUTES,
  LIST_HEADER_PATHS,
  LIST_HEADER_ROUTE_COUNT,
  LIST_HEADER_LABELS,
} from '@/lib/ad-routes'

/**
 * 목록 상단 띠 광고의 노출 경로가 렌더와 어드민에서 어긋나지 않게 고정한다.
 *
 * 회귀 이력: 렌더(ListBannerClient)는 7개 경로를 알고 있었는데 어드민 선택 칩은 6개였다.
 * 갱년기톡이 빠져 있어, 운영자가 노출 페이지를 직접 고르면 그 게시판만 영영 선택할 수 없었다.
 * (전체 공통으로 두면 노출은 되므로 조용히 어긋난 채 남았다.)
 */

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

describe('LIST_HEADER_ROUTES — 경로 목록', () => {
  it('갱년기톡이 포함된다 — 빠져 있던 경로', () => {
    expect(LIST_HEADER_PATHS).toContain('/community/menopause')
    expect(LIST_HEADER_ROUTES.find((r) => r.value === '/community/menopause')?.label).toBe('갱년기톡')
  })

  it('커뮤니티 4개 보드가 모두 있다', () => {
    for (const p of [
      '/community/stories',
      '/community/menopause',
      '/community/life2',
      '/community/humor',
    ]) {
      expect(LIST_HEADER_PATHS, p).toContain(p)
    }
  })

  it('베스트·매거진·내일찾기가 있다', () => {
    expect(LIST_HEADER_PATHS).toContain('/best')
    expect(LIST_HEADER_PATHS).toContain('/magazine')
    expect(LIST_HEADER_PATHS).toContain('/jobs')
  })

  it('경로가 7개다', () => {
    expect(LIST_HEADER_ROUTE_COUNT).toBe(7)
    expect(LIST_HEADER_PATHS).toHaveLength(7)
  })

  it('경로가 중복되지 않고 모두 /로 시작한다', () => {
    expect(new Set(LIST_HEADER_PATHS).size).toBe(LIST_HEADER_PATHS.length)
    for (const p of LIST_HEADER_PATHS) expect(p.startsWith('/'), p).toBe(true)
  })

  it('표시명이 비어 있지 않고 중복되지 않는다', () => {
    const labels = LIST_HEADER_ROUTES.map((r) => r.label)
    for (const l of labels) expect(l.trim().length).toBeGreaterThan(0)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('안내 문구용 라벨 나열이 모든 표시명을 담는다', () => {
    for (const r of LIST_HEADER_ROUTES) expect(LIST_HEADER_LABELS).toContain(r.label)
  })
})

describe('렌더와 어드민이 같은 소스를 본다', () => {
  it('ListBannerClient가 자체 경로 배열을 들고 있지 않다', () => {
    const src = read('src/components/ad/ListBannerClient.tsx')
    expect(src).toMatch(/from '@\/lib\/ad-routes'/)
    // 예전처럼 경로를 직접 나열하면 다시 어긋난다
    expect(src).not.toMatch(/AD_ROUTES\s*=\s*\[\s*'\//)
  })

  it('AdBannerTable이 자체 경로 배열을 들고 있지 않다', () => {
    const src = read('src/components/admin/AdBannerTable.tsx')
    expect(src).toMatch(/from '@\/lib\/ad-routes'/)
    expect(src).not.toMatch(/LIST_HEADER_PAGES[^=]*=\s*\[\s*\{\s*value:/)
  })

  it('어드민 화면에 하드코딩된 "6개" 문구가 없다', () => {
    const src = read('src/components/admin/AdBannerTable.tsx')
    expect(src).not.toContain('6개')
  })

  it('안내 문구가 상수에서 개수를 가져온다', () => {
    const src = read('src/components/admin/AdBannerTable.tsx')
    expect(src).toMatch(/LIST_HEADER_ROUTE_COUNT/)
    expect(src).toMatch(/LIST_HEADER_LABELS/)
  })

  it('도움말 툴팁에도 하드코딩된 "6개"가 없다', () => {
    // ? 아이콘 툴팁도 운영자가 읽는 문구다 — 가이드만 고치고 여기를 빠뜨렸었다
    const src = read('src/components/admin/admin-help-texts.ts')
    expect(src).not.toContain('6개')
    expect(src).toMatch(/LIST_HEADER_ROUTE_COUNT/)
  })
})

describe('실제 도움말 문구 값', () => {
  it('AD_SLOT 툴팁에 갱년기톡이 들어간다', async () => {
    const { HELP } = await import('@/components/admin/admin-help-texts')
    expect(HELP.AD_SLOT).toContain('갱년기톡')
    expect(HELP.AD_SLOT).toContain('7개')
  })

  it('AD_TARGET 툴팁 개수가 경로 수와 같다', async () => {
    const { HELP } = await import('@/components/admin/admin-help-texts')
    expect(HELP.AD_TARGET).toContain(`${LIST_HEADER_ROUTE_COUNT}개`)
  })
})
