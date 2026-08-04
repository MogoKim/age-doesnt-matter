import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  readImageSize,
  checkHeroImage,
  HERO_MIN_WIDTH,
  HERO_MIN_HEIGHT,
  HERO_MIN_RATIO,
  HERO_MAX_RATIO,
} from '@/lib/image-dimensions'

/**
 * 히어로 업로드에 타입·용량 제한만 있고 치수·비율 검증이 없어,
 * 세로형·정사각 이미지가 조용히 올라가 화면에서 대부분 잘렸다.
 * 광고 지면으로 팔려면 규격 밖 소재를 업로드 단계에서 막아야 한다.
 */

/** PNG 최소 헤더 합성 — 시그니처 + IHDR(width/height 빅엔디안) */
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

/** WebP(VP8X) 최소 헤더 합성 — 치수는 24비트 리틀엔디안, 값은 실제-1 */
function webpVp8x(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30)
  buf.write('RIFF', 0, 'ascii')
  buf.write('WEBP', 8, 'ascii')
  buf.write('VP8X', 12, 'ascii')
  const w = width - 1
  const h = height - 1
  buf[24] = w & 0xff; buf[25] = (w >> 8) & 0xff; buf[26] = (w >> 16) & 0xff
  buf[27] = h & 0xff; buf[28] = (h >> 8) & 0xff; buf[29] = (h >> 16) & 0xff
  return buf
}

describe('readImageSize — 포맷별 파싱', () => {
  it('PNG 헤더에서 치수를 읽는다', () => {
    expect(readImageSize(png(2400, 900))).toEqual({ width: 2400, height: 900 })
    expect(readImageSize(png(1, 1))).toEqual({ width: 1, height: 1 })
  })

  it('WebP(VP8X) 헤더에서 치수를 읽는다', () => {
    expect(readImageSize(webpVp8x(2400, 900))).toEqual({ width: 2400, height: 900 })
  })

  it('실제 운영 JPEG를 읽는다', () => {
    // 운영 중인 히어로 이미지 — 파서가 실물에서 동작하는지 고정
    const root = join(__dirname, '..', '..')
    expect(readImageSize(readFileSync(join(root, 'public/images/hero/hero_1.jpg')))).toEqual({
      width: 1920,
      height: 1194,
    })
    expect(readImageSize(readFileSync(join(root, 'public/images/hero/hero_2.jpg')))).toEqual({
      width: 1920,
      height: 1071,
    })
  })

  it('이미지가 아니면 null', () => {
    expect(readImageSize(Buffer.from('not an image'))).toBeNull()
    expect(readImageSize(Buffer.alloc(0))).toBeNull()
    expect(readImageSize(Buffer.alloc(4))).toBeNull()
  })
})

describe('checkHeroImage — 규격 판정', () => {
  it('권장 2400×900은 통과', () => {
    const r = checkHeroImage(png(2400, 900))
    expect(r.ok).toBe(true)
    expect(r.ratio).toBeCloseTo(2.667, 2)
  })

  it('최소치 1600×600은 통과', () => {
    expect(checkHeroImage(png(HERO_MIN_WIDTH, HERO_MIN_HEIGHT)).ok).toBe(true)
  })

  it('세로형은 거부', () => {
    const r = checkHeroImage(png(900, 2400))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('비율')
  })

  it('정사각은 거부', () => {
    expect(checkHeroImage(png(2000, 2000)).ok).toBe(false)
  })

  it('16:9(1920×1080)는 거부 — 기존 가이드가 잘못 안내하던 규격', () => {
    const r = checkHeroImage(png(1920, 1080))
    expect(r.ok).toBe(false)
    expect(r.ratio).toBeCloseTo(1.778, 2)
  })

  it('너무 작으면 거부', () => {
    const r = checkHeroImage(png(1200, 450))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('작습니다')
  })

  it('지나치게 납작해도 거부', () => {
    expect(checkHeroImage(png(4000, 800)).ok).toBe(false) // 5:1
  })

  it('허용 비율 경계값', () => {
    expect(checkHeroImage(png(2000, 1000)).ok).toBe(true) // 정확히 2.0
    expect(checkHeroImage(png(3200, 1000)).ok).toBe(true) // 정확히 3.2
    expect(checkHeroImage(png(1999, 1000)).ok).toBe(false) // 1.999
  })

  it('치수를 못 읽으면 막지 않는다 — 정상 업로드 차단이 더 나쁘다', () => {
    const r = checkHeroImage(Buffer.from('unknown format'))
    expect(r.ok).toBe(true)
    expect(r.size).toBeNull()
  })

  it('상수가 의도한 값인지 고정', () => {
    expect(HERO_MIN_RATIO).toBe(2.0)
    expect(HERO_MAX_RATIO).toBe(3.2)
    expect(HERO_MIN_WIDTH).toBe(1600)
    expect(HERO_MIN_HEIGHT).toBe(600)
  })
})
