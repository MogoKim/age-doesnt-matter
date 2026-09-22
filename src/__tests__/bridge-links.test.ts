import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { bridgeUrl, SORANSORAN_ORIGIN, BRIDGE_COPY, type BridgeSlot } from '@/lib/bridge'

/**
 * Project BRIDGE 계약 테스트.
 *
 * 이 프로젝트의 계측 정본은 소란소란 GA4 하나뿐이고, 구좌 구분은 **UTM 에만** 의존한다.
 * UTM 이 빠진 링크가 하나라도 배포되면 그 구좌의 유입은 영구히 판별 불가가 된다
 * (푸시·TopPromoBanner 는 referrer 자체가 없어 "직접 유입"으로 사라진다).
 * 그래서 사람 눈이 아니라 테스트로 막는다.
 */

const SLOTS: BridgeSlot[] = [
  'popup', 'homecard', 'postdetail', 'footer', 'topbanner', 'push', 'hero', 'listad', 'detailad', 'notice',
]

describe('bridgeUrl — UTM 계약', () => {
  it.each(SLOTS)('%s: utm_source·utm_medium·utm_campaign 이 모두 있다', (slot) => {
    const u = new URL(bridgeUrl(slot))
    expect(u.origin).toBe(SORANSORAN_ORIGIN)
    expect(u.searchParams.get('utm_source')).toBe('unao')
    expect(u.searchParams.get('utm_medium')).toBe(slot)
    expect(u.searchParams.get('utm_campaign')).toBe('bridge')
  })

  it('구좌마다 utm_medium 이 서로 다르다 — 섞이면 구분이 불가능해진다', () => {
    const mediums = SLOTS.map((s) => new URL(bridgeUrl(s)).searchParams.get('utm_medium'))
    expect(new Set(mediums).size).toBe(SLOTS.length)
  })
})

/** src 전체에서 소란소란 도메인을 직접 적은 곳을 찾는다. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'generated') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

describe('소란소란 URL 하드코딩 금지', () => {
  it('🔴 soransoran.com 을 직접 적은 파일은 src/lib/bridge.ts 뿐이다', () => {
    const srcRoot = resolve(__dirname, '..')
    const offenders = walk(srcRoot)
      .filter((f) => readFileSync(f, 'utf8').includes('soransoran.com'))
      .map((f) => f.slice(srcRoot.length + 1))
      .filter((f) => f !== 'lib/bridge.ts')

    // 하드코딩하면 UTM 을 빠뜨리기 쉽다. 반드시 bridgeUrl(slot) 을 쓴다.
    expect(offenders).toEqual([])
  })
})

describe('금지 표현 (영구)', () => {
  const banned = [
    ['광고 없', '광고를 붙일 계획이 있다 — 붙이는 순간 거짓이 된다'],
    ['소란소란으로 변경', '병행 운영이라 사실이 아니다. 우나어는 계속 살아 있다'],
    ['시니어', '브랜드 금지어'],
    ['어르신', '브랜드 금지어'],
    ['실버', '브랜드 금지어'],
  ] as const

  it.each(banned)('BRIDGE_COPY 에 "%s" 가 없다 (%s)', (word) => {
    const all = Object.values(BRIDGE_COPY).join(' ')
    expect(all).not.toContain(word)
  })

  it('"지금은" 이 붙어 있다 — 댓글률이 떨어져도 거짓이 되지 않게 하는 장치', () => {
    expect(BRIDGE_COPY.hook).toContain('지금은')
  })
})

describe('공격적 모드 — 노출 억제 장치가 없다', () => {
  // 창업자 결정(2026-09-22): 읽기 화면 포함 전 경로에서 띄우고, 닫아도 저장하지 않는다.
  // 되돌릴 때를 대비해 "왜 없는지"를 테스트로 남긴다.
  const src = readFileSync(resolve(__dirname, '../components/features/bridge/SoranSoranPopup.tsx'), 'utf8')

  it('경로로 노출을 막지 않는다 — isReadingPage 류 게이트가 없다', () => {
    expect(src).not.toContain('isReadingPage')
  })

  it('닫은 기록을 저장하지 않는다 — localStorage 를 쓰지 않는다', () => {
    expect(src).not.toContain('localStorage')
  })

  it('X 버튼을 제외한 카드 전체가 소란소란 링크다', () => {
    expect(src).toContain("bridgeUrl('popup')")
    expect(src).toMatch(/label="닫기"/)
  })
})

describe('글 상세 카피 — SEO 유입 접점', () => {
  it('금지 표현이 없다', () => {
    const all = Object.values(BRIDGE_COPY.post).join(' ')
    for (const w of ['광고 없', '소란소란으로 변경', '시니어', '어르신', '실버']) {
      expect(all).not.toContain(w)
    }
  })

  it('"지금은" 장치가 글 상세 카피에도 있다', () => {
    expect(BRIDGE_COPY.post.hook).toContain('지금은')
  })
})
