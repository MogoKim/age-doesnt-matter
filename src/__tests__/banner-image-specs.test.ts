import { describe, it, expect } from 'vitest'
import { checkBannerImage, checkHeroImage, BANNER_SPECS } from '@/lib/image-dimensions'

/**
 * 배너 지면이 둘인데 업로드 API는 하나를 공유한다.
 *
 * 회귀 이력: 히어로 규격(8:3, 2.55~2.8)을 그 공용 API에 넣으면서
 * 광고 슬롯 권장 규격(1200×400 = 3:1)이 전부 거부됐다 — 광고 이미지를 아예 올릴 수 없었다.
 * 지면별로 규격을 갈라 두 자리가 서로를 막지 않게 고정한다.
 *
 * 이후 홈 상단 구좌도 3:1로 통일됐다(브랜드 히어로·광고주 배너·참여이벤트가 같은 자리를 쓰므로).
 * 비율은 같아졌지만 target 분리는 그대로 유지한다 — 최소 크기가 다르고, 거부 사유에
 * 어느 자리인지 적어야 운영자가 어디에 올리는 중인지 안다.
 */

/** PNG 최소 헤더 합성 */
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

describe('광고 슬롯(ad) 규격 — 회귀 방지', () => {
  it('권장 1200×400(3:1)이 통과한다 — 이게 막혔던 회귀', () => {
    const r = checkBannerImage(png(1200, 400), 'ad')
    expect(r.ok).toBe(true)
    expect(r.ratio).toBeCloseTo(3.0, 2)
  })

  it('최소 960×320(렌더 실제 크기)이 통과한다', () => {
    expect(checkBannerImage(png(960, 320), 'ad').ok).toBe(true)
  })

  it('같은 3:1의 큰 크기도 통과한다', () => {
    expect(checkBannerImage(png(1800, 600), 'ad').ok).toBe(true)
    expect(checkBannerImage(png(2400, 800), 'ad').ok).toBe(true)
  })

  it('제작 오차(2.9~3.1)는 받아준다', () => {
    expect(checkBannerImage(png(1160, 400), 'ad').ok).toBe(true) // 2.90
    expect(checkBannerImage(png(1240, 400), 'ad').ok).toBe(true) // 3.10
  })

  it('옛 히어로 규격 2400×900(8:3)은 거부한다 — 3:1이 아니다', () => {
    const r = checkBannerImage(png(2400, 900), 'ad')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('광고 슬롯')
  })

  it('960×320보다 작으면 거부한다', () => {
    const r = checkBannerImage(png(900, 300), 'ad')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('작습니다')
  })

  it('세로형·정사각·16:9·극단 비율을 거부한다', () => {
    for (const [w, h] of [[400, 1200], [1000, 1000], [1920, 1080], [4000, 800]]) {
      expect(checkBannerImage(png(w, h), 'ad').ok, `${w}x${h}`).toBe(false)
    }
  })
})

describe('홈 상단 구좌(hero) 규격 — 3:1 통일', () => {
  it('권장 2400×800이 통과한다', () => {
    expect(checkBannerImage(png(2400, 800), 'hero').ok).toBe(true)
  })

  it('최소 1200×400이 통과한다', () => {
    expect(checkBannerImage(png(1200, 400), 'hero').ok).toBe(true)
  })

  it('옛 히어로 규격 2400×900(8:3)은 거부한다 — 3:1로 통일됐다', () => {
    const r = checkBannerImage(png(2400, 900), 'hero')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('비율')
  })

  it('광고 슬롯 최소 960×320은 비율은 맞지만 홈 상단에는 작아서 거부한다', () => {
    const r = checkBannerImage(png(960, 320), 'hero')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('작습니다')
  })

  it('checkHeroImage 래퍼가 hero 규격과 같은 결과를 낸다', () => {
    for (const [w, h] of [[2400, 800], [2400, 900], [1000, 1000], [1200, 400]]) {
      expect(checkHeroImage(png(w, h)).ok, `${w}x${h}`).toBe(checkBannerImage(png(w, h), 'hero').ok)
    }
  })
})

describe('두 지면 규격이 서로를 막지 않는다', () => {
  it('두 지면 모두 3:1 — 홈 상단 구좌와 광고 슬롯의 허용 비율이 같다', () => {
    // 정책: 같은 3:1. 지면 차이는 비율이 아니라 최소 크기에만 남는다.
    // (예전에는 범위를 일부러 어긋나게 둬서 지면 혼동을 잡았는데, 규격이 통일되며 그 장치는 사라졌다.)
    expect(BANNER_SPECS.hero.minRatio).toBe(BANNER_SPECS.ad.minRatio)
    expect(BANNER_SPECS.hero.maxRatio).toBe(BANNER_SPECS.ad.maxRatio)
    expect(BANNER_SPECS.hero.minWidth).toBeGreaterThan(BANNER_SPECS.ad.minWidth)
  })

  it('홈 상단 구좌 권장 2400×800은 광고 슬롯에도 올릴 수 있다 — 같은 3:1', () => {
    expect(checkBannerImage(png(2400, 800), 'ad').ok).toBe(true)
  })

  it('각 지면의 권장 규격은 자기 범위 안에 있다', () => {
    for (const target of ['hero', 'ad'] as const) {
      const s = BANNER_SPECS[target]
      const ratio = s.recommended.width / s.recommended.height
      expect(ratio, target).toBeGreaterThanOrEqual(s.minRatio)
      expect(ratio, target).toBeLessThanOrEqual(s.maxRatio)
      expect(checkBannerImage(png(s.recommended.width, s.recommended.height), target).ok, target).toBe(true)
    }
  })

  it('각 지면의 최소 크기도 자기 규격을 통과한다', () => {
    for (const target of ['hero', 'ad'] as const) {
      const s = BANNER_SPECS[target]
      expect(checkBannerImage(png(s.minWidth, s.minHeight), target).ok, target).toBe(true)
    }
  })

  it('거부 사유에 어느 지면인지 적힌다', () => {
    expect(checkBannerImage(png(1000, 1000), 'hero').reason).toContain('홈 상단 구좌')
    expect(checkBannerImage(png(1000, 1000), 'ad').reason).toContain('광고 슬롯')
  })

  it('치수를 못 읽으면 양쪽 다 막지 않는다', () => {
    for (const target of ['hero', 'ad'] as const) {
      expect(checkBannerImage(Buffer.from('unknown'), target).ok, target).toBe(true)
    }
  })
})
