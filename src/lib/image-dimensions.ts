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

// ── 배너 지면별 규격 ────────────────────────────────────────────────────────
//
// 배너 자리가 둘이고 업로드 API는 하나를 공유한다. 그래서 규격을 지면(target)별로
// 나눠 들고 검사도 지면별로 한다.
//
//  홈 상단 구좌     : 홈 최상단. 브랜드 히어로 · 광고주 배너 · 참여이벤트가 돌아가며 쓴다.
//                    전 뷰포트 3:1, 데스크탑 컨테이너 1200px → 권장 2400×800
//  목록 상단 띠(광고) : 목록 7개 페이지 상단. 전 구간 3:1, 데스크탑 컨테이너 960px → 권장 1200×400
//
// 두 지면 모두 3:1이다. 성격이 달라도 같은 구좌·같은 모양이어야 소재를 한 벌만 만들면 되고,
// 광고주에게 줄 규격도 하나로 끝난다. 지면 차이는 비율이 아니라 **크기**에만 남는다 —
// 홈 상단이 더 크게 그려지므로 최소 치수가 더 크다(1200×400 vs 960×320).
//
// 허용 범위는 권장값 언저리(±5%)로 좁게 잡는다. 업로드 검증은 "실수를 막는 장치"라
// 규격서와 다른 이미지를 통과시키면 검증의 의미가 없다.

/** 업로드 지면 — 어느 배너 자리에 쓸 이미지인지 */
export type BannerTarget = 'hero' | 'ad'

export interface BannerImageSpec {
  /** 권장 원본 — 광고주 가이드에 그대로 쓰는 값 */
  recommended: { width: number; height: number }
  minWidth: number
  minHeight: number
  minRatio: number
  maxRatio: number
  /** 사람이 읽는 지면 이름 — 거부 사유 문구에 쓴다 */
  label: string
  /** 권장 비율 표기(문구용) */
  ratioLabel: string
}

export const BANNER_SPECS: Record<BannerTarget, BannerImageSpec> = {
  // 3:1 ±5%. 렌더가 전 뷰포트 3:1이라 규격대로 올리면 잘리는 곳이 없다.
  hero: {
    recommended: { width: 2400, height: 800 },
    // 데스크탑 컨테이너 1200×400의 원본 크기 — 그보다 작으면 확대되어 흐려진다
    minWidth: 1200,
    minHeight: 400,
    minRatio: 2.85,
    maxRatio: 3.15,
    label: '홈 상단 구좌(홈 최상단 배너)',
    ratioLabel: '3:1',
  },
  // 3:1 ±5%. 렌더 컨테이너가 960×320이라 최소를 그 크기로 둔다 —
  // 그보다 작으면 확대되어 흐려진다. 권장 1200×400은 여유 있게 통과한다.
  ad: {
    recommended: { width: 1200, height: 400 },
    minWidth: 960,
    minHeight: 320,
    minRatio: 2.85,
    maxRatio: 3.15,
    label: '광고 슬롯(목록 상단 띠)',
    ratioLabel: '3:1',
  },
}

/** @deprecated 지면별 상수를 쓰세요 — BANNER_SPECS.hero */
export const HERO_RECOMMENDED = BANNER_SPECS.hero.recommended
export const HERO_MIN_WIDTH = BANNER_SPECS.hero.minWidth
export const HERO_MIN_HEIGHT = BANNER_SPECS.hero.minHeight
export const HERO_MIN_RATIO = BANNER_SPECS.hero.minRatio
export const HERO_MAX_RATIO = BANNER_SPECS.hero.maxRatio
/**
 * 규격대로 올린 이미지에서 어느 뷰포트에서도 잘리지 않고 남는 가로 비율.
 * 홈 상단 구좌가 전 뷰포트 3:1로 통일되면서 좌우 잘림이 사라져 100%다
 * (모바일 2:1 / PC 8:3으로 갈려 있던 시절에는 70%였다).
 */
export const HERO_SAFE_AREA_RATIO = 1

export interface HeroImageCheck {
  ok: boolean
  size: ImageSize | null
  ratio: number | null
  /** 사용자에게 보여줄 사유 — ok=true면 없음 */
  reason?: string
}

/**
 * 업로드된 배너 이미지가 해당 지면 규격에 맞는지 본다.
 * 치수를 못 읽으면 막지 않는다 — 파서가 모르는 변종 때문에 정상 업로드를 차단하는 쪽이 더 나쁘다.
 */
export function checkBannerImage(buf: Buffer, target: BannerTarget): HeroImageCheck {
  const spec = BANNER_SPECS[target]
  const size = readImageSize(buf)
  if (!size) return { ok: true, size: null, ratio: null }

  const ratio = size.width / size.height
  const rec = `${spec.recommended.width}×${spec.recommended.height}(${spec.ratioLabel})`

  // 비율을 먼저 본다. 세로 사진(900×2400)은 크기 조건에도 걸리지만,
  // "너무 작다"고 안내하면 더 큰 세로 사진을 다시 올리게 된다 — 모양이 문제라는 걸 먼저 알려야 한다.
  if (ratio < spec.minRatio || ratio > spec.maxRatio) {
    return {
      ok: false,
      size,
      ratio,
      reason: `[${spec.label}] 가로세로 비율이 맞지 않습니다 (${size.width}×${size.height} = ${ratio.toFixed(2)}:1). 가로가 세로의 ${spec.minRatio}~${spec.maxRatio}배인 가로형만 사용할 수 있습니다. 권장은 ${rec}입니다.`,
    }
  }

  if (size.width < spec.minWidth || size.height < spec.minHeight) {
    return {
      ok: false,
      size,
      ratio,
      reason: `[${spec.label}] 이미지가 너무 작습니다 (${size.width}×${size.height}). 최소 ${spec.minWidth}×${spec.minHeight}, 권장 ${rec}입니다.`,
    }
  }

  return { ok: true, size, ratio }
}

/** 히어로 전용 래퍼 — 기존 호출부 호환용 */
export function checkHeroImage(buf: Buffer): HeroImageCheck {
  return checkBannerImage(buf, 'hero')
}
