/**
 * 이미지 치수 파싱 — 헤더만 읽는다 (JPEG · PNG · WebP).
 *
 * 배경: 히어로 배너 업로드에 타입·용량 제한만 있고 치수·비율 검증이 없었다.
 * 세로형·정사각 이미지를 올려도 통과하고, 화면에서는 object-cover가 대부분을 잘라낸다.
 * 광고 상품으로 팔려면 규격 밖 이미지가 조용히 들어가는 상태를 막아야 한다.
 *
 * sharp 같은 네이티브 의존성은 Vercel 서버리스에서 번들 크기·콜드스타트 부담이 있어 쓰지 않는다.
 * 세 포맷 모두 앞부분 수십~수백 바이트에 치수가 있어 헤더만 읽으면 충분하다.
 */

export interface ImageSize {
  width: number
  height: number
}

/** PNG — 8바이트 시그니처 뒤 IHDR 청크에 width/height가 빅엔디안 4바이트씩 들어 있다. */
function parsePng(buf: Buffer): ImageSize | null {
  if (buf.length < 24) return null
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return null
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * JPEG — SOI(FFD8) 뒤 마커를 순회하다 SOF 세그먼트에서 치수를 읽는다.
 * SOF는 C0~CF 중 C4(DHT)·C8(JPG 확장)·CC(DAC)를 뺀 나머지다.
 */
function parseJpeg(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let off = 2
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++ // 채움 바이트(FF FF …)나 어긋난 위치 — 한 칸씩 재동기화
      continue
    }
    const marker = buf[off + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2
      continue
    }
    const len = buf.readUInt16BE(off + 2)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      // 세그먼트: [len(2)][precision(1)][height(2)][width(2)]
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) }
    }
    if (len < 2) return null // 깨진 파일 — 무한루프 방지
    off += 2 + len
  }
  return null
}

/** WebP — RIFF 컨테이너. 청크 종류(VP8 / VP8L / VP8X)마다 치수 위치가 다르다. */
function parseWebp(buf: Buffer): ImageSize | null {
  if (buf.length < 30) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunk = buf.toString('ascii', 12, 16)

  if (chunk === 'VP8X') {
    // 확장 포맷 — 24비트 리틀엔디안, 실제 값은 +1
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16)
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16)
    return { width: w + 1, height: h + 1 }
  }

  if (chunk === 'VP8 ') {
    // 손실 압축 — 프레임 헤더의 14비트 값(상위 2비트는 스케일)
    const w = buf.readUInt16LE(26) & 0x3fff
    const h = buf.readUInt16LE(28) & 0x3fff
    return { width: w, height: h }
  }

  if (chunk === 'VP8L') {
    // 무손실 — 시그니처(0x2f) 뒤 14+14비트에 (width-1, height-1)
    if (buf[20] !== 0x2f) return null
    const bits = buf.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }

  return null
}

/** 지원 포맷의 치수를 읽는다. 판별 실패 시 null — 호출부가 "확인 불가"로 처리한다. */
export function readImageSize(buf: Buffer): ImageSize | null {
  const size = parsePng(buf) ?? parseJpeg(buf) ?? parseWebp(buf)
  if (!size) return null
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null
  if (size.width <= 0 || size.height <= 0) return null
  return size
}

// ── 히어로 배너 규격 ────────────────────────────────────────────────────────
//
// 렌더 비율은 모바일·태블릿 2:1, lg(1024px~) 8:3(2.667)이다.
// 원본은 가장 넓은 8:3으로 받아 데스크탑을 기준으로 삼고, 모바일에서는 좌우가 잘린다.
//
// 허용 범위를 권장값 언저리로 좁게 잡는다. 업로드 검증은 "실수를 막는 장치"라
// 규격서와 다른 이미지를 통과시키면 검증의 의미가 없다.
// 실제 잘림(권장 2.667 기준):
//   2.55 → 데스크탑 상하 4.4% 잘림 / 모바일 좌우 21.6%
//   2.667 → 데스크탑 0% / 모바일 좌우 25.0%   ← 권장
//   2.80 → 데스크탑 좌우 4.7% / 모바일 좌우 28.6%
// 상·하한 모두 데스크탑 잘림을 5% 미만으로 묶는 선이다.

/** 권장 원본 — 광고주 가이드에 그대로 쓰는 값 */
export const HERO_RECOMMENDED = { width: 2400, height: 900 } as const
/** 최소 허용 가로폭 — 데스크탑 컨테이너(1200px) 2배수(레티나) 기준 */
export const HERO_MIN_WIDTH = 1600
export const HERO_MIN_HEIGHT = 600
/** 허용 가로세로비 — 8:3(2.667) ±5% 남짓. 제작 오차는 받되 다른 규격은 막는다. */
export const HERO_MIN_RATIO = 2.55
export const HERO_MAX_RATIO = 2.8
/**
 * 모바일(2:1)에서 좌우가 잘려도 남는 최소 가로 비율.
 * 허용 상한 2.8일 때 71.4%가 남으므로 70%를 안전선으로 안내한다.
 */
export const HERO_SAFE_AREA_RATIO = 0.7

export interface HeroImageCheck {
  ok: boolean
  size: ImageSize | null
  ratio: number | null
  /** 사용자에게 보여줄 사유 — ok=true면 없음 */
  reason?: string
}

/**
 * 업로드된 히어로 이미지가 규격에 맞는지 본다.
 * 치수를 못 읽으면 막지 않는다 — 파서가 모르는 변종 때문에 정상 업로드를 차단하는 쪽이 더 나쁘다.
 */
export function checkHeroImage(buf: Buffer): HeroImageCheck {
  const size = readImageSize(buf)
  if (!size) return { ok: true, size: null, ratio: null }

  const ratio = size.width / size.height

  // 비율을 먼저 본다. 세로 사진(900×2400)은 크기 조건에도 걸리지만,
  // "너무 작다"고 안내하면 더 큰 세로 사진을 다시 올리게 된다 — 모양이 문제라는 걸 먼저 알려야 한다.
  if (ratio < HERO_MIN_RATIO || ratio > HERO_MAX_RATIO) {
    return {
      ok: false,
      size,
      ratio,
      reason: `가로세로 비율이 맞지 않습니다 (${size.width}×${size.height} = ${ratio.toFixed(2)}:1). 가로가 세로의 ${HERO_MIN_RATIO}~${HERO_MAX_RATIO}배인 가로형만 사용할 수 있습니다. 권장은 ${HERO_RECOMMENDED.width}×${HERO_RECOMMENDED.height}(2.67:1)입니다.`,
    }
  }

  if (size.width < HERO_MIN_WIDTH || size.height < HERO_MIN_HEIGHT) {
    return {
      ok: false,
      size,
      ratio,
      reason: `이미지가 너무 작습니다 (${size.width}×${size.height}). 최소 ${HERO_MIN_WIDTH}×${HERO_MIN_HEIGHT}, 권장 ${HERO_RECOMMENDED.width}×${HERO_RECOMMENDED.height}입니다.`,
    }
  }

  return { ok: true, size, ratio }
}
