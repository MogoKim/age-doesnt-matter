/**
 * 삭제 글의 R2 객체 키 산출 — **순수** 로직.
 *
 * 🔴 이 파일이 존재하는 이유는 실측에서 나온 함정 하나 때문이다.
 *    `pub-….r2.dev` 와 `img.age-doesnt-matter.com` 은 **같은 버킷**이다
 *    (같은 키에 HEAD 를 걸어 ETag 가 일치하는 것을 확인했다).
 *    그래서 **URL 로 공유 여부를 세면 안 된다.** 보존 글이 다른 호스트로
 *    같은 객체를 참조하고 있으면 못 보고 지워버린다. 반드시 **키**로 센다.
 */

/** 같은 버킷을 가리키는 공개 호스트. 여기 없는 호스트는 우리 객체가 아니다. */
export const R2_PUBLIC_HOSTS: readonly string[] = [
  'pub-b0ae348768da4b63a66112f4751f5ae5.r2.dev',
  'img.age-doesnt-matter.com',
]

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g

/** 글 하나가 참조하는 이미지 URL. 썸네일 + 본문. */
export function extractImageUrls(thumbnailUrl: string | null, content: string): string[] {
  const out = new Set<string>()
  const t = thumbnailUrl?.trim()
  if (t) out.add(t)
  for (const m of content.match(URL_RE) ?? []) {
    const cleaned = m.replace(/[),.]+$/, '')
    if (IMAGE_EXT.test(cleaned)) out.add(cleaned)
  }
  return [...out]
}

/** 우리 버킷의 객체 키. 우리 것이 아니면 null. */
export function toObjectKey(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (!R2_PUBLIC_HOSTS.includes(u.host)) return null
  const key = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  return key === '' ? null : key
}

export interface PostImageSource { id: string; thumbnailUrl: string | null; content: string }

/**
 * 글이 아닌 **다른 모델**이 들고 있는 이미지.
 *
 * 🔴 실측: `SocialPost.imageUrls` · `NaverBlogQueue.imageUrls` 까지 대조하니
 *    공유 객체가 0 → **16** 으로 늘었다. 글끼리만 비교하면 그 16개를 지웠을 것이다.
 *    `ChannelDraft.imageUrls` · `Banner.imageUrl` 도 같은 이유로 본다.
 */
export interface ForeignImageSource {
  model: string
  /** 이미 URL 인 필드 — `imageUrl` · `imageUrls[]` · `profileImage` 등 */
  urls?: readonly string[]
  /** 본문 — 안에 박힌 이미지 URL 을 뽑아내야 하는 필드(`content` · `body`) */
  texts?: readonly string[]
}

export interface R2Plan {
  /** 삭제 글만 참조하는 키 — 삭제 대상 */
  exclusive: string[]
  /** 보존 글도 참조하는 키 — **절대 삭제 금지** */
  shared: string[]
  /** 우리 버킷 밖의 URL — 손대지 않는다 */
  external: string[]
}

/**
 * 🔴 **지금 살아 있는 참조 키 전부.**
 *
 * 이전 구현은 공유 판정을 "삭제 대상이 참조하는 키" 안에서만 했다.
 * 그래서 삭제 집합에서 빠진 글(보호된 글)만 쓰는 manifest 키는 공유로 안 잡히고,
 * manifest 를 순회하면 **살아 있는 글의 이미지를 지웠다.**
 *
 * 보호 판정에 삭제 대상은 **입력이 아니다.** 지금 DB 에 남아 있는 것만 보면 된다.
 * 그래서 이 함수는 `doomedIds`·`deletedIds`·preflight 스냅샷을 받지 않는다.
 */
export function liveReferencedKeys(
  livePosts: readonly PostImageSource[],
  foreign: readonly ForeignImageSource[],
): Set<string> {
  const keys = new Set<string>()
  for (const p of livePosts) {
    for (const u of extractImageUrls(p.thumbnailUrl, p.content)) {
      const k = toObjectKey(u)
      if (k) keys.add(k)
    }
  }
  for (const f of foreign) {
    for (const u of f.urls ?? []) {
      const k = toObjectKey(u)
      if (k) keys.add(k)
    }
    for (const t of f.texts ?? []) {
      for (const u of extractImageUrls(null, t)) {
        const k = toObjectKey(u)
        if (k) keys.add(k)
      }
    }
  }
  return keys
}

/**
 * 글에 딸린 행 중 **이번 실행에서 함께 사라질 것**을 뺀다.
 *
 * 🔴 "삭제 후" 미리보기를 낼 때만 쓴다.
 *    글이 지워지면 `Comment`·`CpsLink` 는 CASCADE 로, `NaverBlogQueue` 는 CLEANUP 정책으로
 *    같이 사라진다. 그 행들을 "살아 있는 참조"로 세면 미리보기가 보호를 과대 계상한다.
 *    (실측: 삭제 대상 NaverBlogQueue 15행이 manifest 키 16개를 참조하는데,
 *     그 15행은 이번 실행에서 같이 지워진다 → 삭제 후 보호는 0 이다.)
 *
 * ⚠️ **실제 실행의 보호 계산에는 쓰지 않는다.** 커밋 뒤에는 DB 가 이미 진실이라
 *    전체를 그대로 읽으면 된다 — 추정이 끼어들 자리가 없다.
 */
export function excludeDoomedOwners<T>(
  rows: readonly T[],
  ownerOf: (row: T) => string | null,
  doomed: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => {
    const owner = ownerOf(r)
    return owner === null || !doomed.has(owner)
  })
}

/**
 * manifest 중 **건드리면 안 되는** 키 = manifest ∩ 살아 있는 참조.
 *
 * 나머지(참조가 완전히 사라진 것)만 삭제 후보다.
 */
export function protectedManifestKeys(
  manifest: readonly string[],
  liveKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(manifest.filter((k) => liveKeys.has(k)))].sort()
}

/** manifest 에서 실제로 지울 키. 보고용이다 — 실행은 sharedKeys 로 막는다. */
export function deletableManifestKeys(
  manifest: readonly string[],
  liveKeys: ReadonlySet<string>,
): string[] {
  return [...new Set(manifest.filter((k) => !liveKeys.has(k)))].sort()
}

/**
 * 삭제 대상 키를 고른다.
 *
 * `preserved` 는 **남는 글 전부**여야 하고, `foreign` 은 이미지를 들고 있는
 * **다른 모델 전부**여야 한다. 둘 중 하나라도 빠지면 공유 객체를 못 보고 지운다.
 */
export function planR2Deletion(
  doomed: readonly PostImageSource[],
  preserved: readonly PostImageSource[],
  foreign: readonly ForeignImageSource[] = [],
): R2Plan {
  const keep = new Set<string>()
  for (const p of preserved) {
    for (const u of extractImageUrls(p.thumbnailUrl, p.content)) {
      const k = toObjectKey(u)
      if (k) keep.add(k)
    }
  }
  // 글이 아닌 모델이 쓰는 객체도 보존 대상이다.
  for (const k of liveReferencedKeys([], foreign)) keep.add(k)

  const exclusive = new Set<string>()
  const shared = new Set<string>()
  const external = new Set<string>()
  for (const p of doomed) {
    for (const u of extractImageUrls(p.thumbnailUrl, p.content)) {
      const k = toObjectKey(u)
      if (k === null) { external.add(u); continue }
      if (keep.has(k)) shared.add(k)
      else exclusive.add(k)
    }
  }

  return { exclusive: [...exclusive].sort(), shared: [...shared].sort(), external: [...external].sort() }
}

// ── 객체 단위 처리 결과 ────────────────────────────────────────
/**
 * 객체 하나의 처리 판정.
 *
 * 창업자 지시: **공유 여부나 HEAD 상태가 불명확하면 그 객체만 빼고,
 * 글 삭제 자체는 막지 않는다.** 그래서 이미지 실패는 ABORT 사유가 아니다.
 */
export type ObjectOutcome = 'DELETED' | 'ALREADY_GONE' | 'SKIPPED_SHARED' | 'SKIPPED_UNCERTAIN'

export function classifyHead(status: number): 'PRESENT' | 'ABSENT' | 'UNCERTAIN' {
  if (status === 200) return 'PRESENT'
  if (status === 404) return 'ABSENT'
  // 403·429·5xx 는 "없다"는 뜻이 아니다. 모르는 것은 모른다고 한다.
  return 'UNCERTAIN'
}

export function classifyDelete(status: number): 'DELETED' | 'UNCERTAIN' {
  // S3 DELETE 는 없는 키에도 204 를 준다.
  return status === 204 || status === 200 ? 'DELETED' : 'UNCERTAIN'
}
