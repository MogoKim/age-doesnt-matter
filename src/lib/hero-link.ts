/**
 * 히어로 배너 CTA 링크 판별 — 내부 이동 / 외부 새 탭 / 차단.
 *
 * 배경: 히어로 배너를 외부 광고주에게 판매하려면 광고주 사이트로 나가는 링크를 받아야 한다.
 * 그런데 기존 렌더는 `<Link href={ctaUrl ?? '/'}>` 하나로 전부 처리해서 두 가지 문제가 있었다.
 *   1) 외부 도메인도 같은 탭에서 열려 사용자가 우나어를 떠난다.
 *      특히 Capacitor/TWA 앱에서는 앱 웹뷰 안에 광고주 사이트가 갇혀 돌아올 길이 없다.
 *   2) `javascript:` 같은 스킴이 관리자 입력으로 들어오면 그대로 렌더된다.
 *
 * 그래서 저장·렌더 양쪽에서 같은 규칙을 쓰도록 순수 함수로 분리한다.
 */

export type HeroLinkKind = 'internal' | 'external' | 'blocked'

export interface HeroLink {
  kind: HeroLinkKind
  /** 실제로 렌더할 href. blocked면 홈('/')으로 되돌린다. */
  href: string
  /** blocked 사유 — 관리자 화면 안내와 로깅용 */
  reason?: string
}

const HOME = '/'

/** 외부로 내보낼 수 있는 스킴은 https 하나뿐이다. http는 혼합 콘텐츠·중간자 위험이라 막는다. */
const EXTERNAL_ALLOWED = /^https:\/\/[^/\s]+/i

/**
 * 명시적으로 막는 스킴. 목록에 없는 미지의 스킴(`custom-app:`)도
 * "내부(`/`)도 https도 아니면 차단"이라는 기본 규칙에서 함께 걸린다.
 */
const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript|file|ftp|mailto|tel|blob|about)\s*:/i

/**
 * CTA URL을 렌더 가능한 형태로 판별한다.
 *
 * - 빈 값 → 홈(`/`). 기존 동작을 유지한다. 광고 배너에서는 관리자 저장 단계가 먼저 막는다.
 * - `/`로 시작 → 내부 경로. 앱 안에서 클라이언트 라우팅으로 이동한다.
 * - `https://` → 외부. 새 탭 + `rel="noopener noreferrer nofollow"`로 연다.
 * - 그 밖(`http://`, `javascript:`, `//evil.com`, 상대경로 등) → 차단하고 홈으로 되돌린다.
 */
export function resolveHeroLink(raw: string | null | undefined): HeroLink {
  const value = (raw ?? '').trim()
  if (!value) return { kind: 'internal', href: HOME }

  if (DANGEROUS_SCHEME.test(value)) {
    return { kind: 'blocked', href: HOME, reason: '허용하지 않는 스킴입니다' }
  }

  // 프로토콜 상대 경로(`//evil.com`)는 내부처럼 보이지만 외부로 나간다 — 내부 판정보다 먼저 막는다.
  if (value.startsWith('//')) {
    return { kind: 'blocked', href: HOME, reason: '프로토콜 상대 경로는 사용할 수 없습니다' }
  }

  if (value.startsWith('/')) {
    return { kind: 'internal', href: value }
  }

  if (EXTERNAL_ALLOWED.test(value)) {
    return { kind: 'external', href: value }
  }

  // `http://`, `example.com`(스킴 없음), 상대경로 등
  return { kind: 'blocked', href: HOME, reason: '내부 경로(/) 또는 https:// 주소만 사용할 수 있습니다' }
}

/** 관리자 저장 단계 검증용 — 저장을 막아야 하면 사유 문자열, 통과면 null. */
export function validateCtaUrlForSave(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null // 빈 값 허용 — 렌더 시 홈으로 간다
  const link = resolveHeroLink(value)
  return link.kind === 'blocked' ? (link.reason ?? '사용할 수 없는 주소입니다') : null
}
