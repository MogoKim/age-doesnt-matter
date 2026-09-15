/**
 * 우나어 디자인 토큰 — **계약 정본**.
 *
 * 값은 `src/app/globals.css` 의 `:root` 에 있다. 이 파일은 **그 값들을 어떻게 쓰는가**를 정한다.
 * 계약 위반은 `design-token-contract.test.ts` 와 `scripts/design-token-audit.ts` 가 잡는다.
 *
 * ── 구조 (Material 3 의 계층 원칙만 참고했다 — MUI 는 설치하지 않고 시각도 복제하지 않는다) ──
 *  reference  원자값. 화면 코드에서 직접 쓰지 않는다.
 *  system     역할 기반. 화면 코드가 쓰는 계층이다.
 *  component  특정 컴포넌트 전용. 다른 곳에서 재사용하지 않는다.
 *
 * ── 밀도 (2026-09-15 실측) ──
 *  public/mobile 은 52px 컨트롤 279회·본문 17~18px, admin 은 10~11px 텍스트 33회로 이미 다르다.
 *  **같은 토큰을 쓰되 크기만 다른 variant** 로 가른다. admin 에 52px 를 강제하지 않는다.
 */

// ──────────────────────────────────────────────────────────────
// 1. 색상 표기 계약
// ──────────────────────────────────────────────────────────────

/**
 * 🔴 **HSL triplet 토큰** — 값이 `5 100% 69%` 형태다.
 *
 * 반드시 `hsl(var(--x))` 로 쓴다. Tailwind 가 `bg-primary/50` 같은 알파를 붙일 수 있는 건
 * 이 형태뿐이다. `var(--primary)` 로 그냥 쓰면 `color: 5 100% 69%` 가 되어 **무효**다.
 */
export const HSL_TRIPLET_TOKENS = [
  '--background', '--foreground',
  '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--primary', '--primary-foreground', '--primary-text', '--primary-strong',
  '--secondary', '--secondary-foreground',
  '--muted', '--muted-foreground', '--muted-strong', '--muted-subtle',
  '--accent', '--accent-foreground',
  '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring',
  '--success', '--success-foreground',
  '--warning', '--warning-foreground',
  '--info', '--info-foreground',
] as const

/**
 * **완성값 토큰** — `#RRGGBB` · `rgba()` · 길이 · 그림자.
 *
 * 반드시 `var(--x)` 로 쓴다. `hsl()` 로 감싸면 무효가 된다.
 * (여기 없고 위에도 없는 토큰은 component 계층 색이며, 전부 완성값이다.)
 */
export const LITERAL_VALUE_TOKENS = [
  '--kakao-bg', '--kakao-text',
  '--radius', '--radius-full',
  '--elevation-1', '--elevation-2', '--elevation-3',
  '--control-h-touch', '--control-h-desktop', '--control-h-sm', '--control-h-lg', '--control-h-compact',
  '--space-row-y', '--content-max', '--content-max-wide',
] as const

// ──────────────────────────────────────────────────────────────
// 2. 계층
// ──────────────────────────────────────────────────────────────

/**
 * reference — 원자값. 화면 코드에서 직접 참조하면 계약 위반이다.
 *
 * 🔴 지금은 비어 있다. 카카오 색은 reference 로 뒀다가 **component 로 내렸다** —
 *    카카오 로그인 버튼이라는 **특정 컴포넌트 전용 색**이고, 화면이 직접 써야 의미가 있다.
 *    reference 로 두면 "직접 쓰지 마라" 와 "이 버튼은 이 색이어야 한다" 가 모순된다.
 */
export const REFERENCE_TOKENS = [] as const

/**
 * 아직 화면에 없지만 **디자인상 확정된** 토큰.
 *
 * 참조 0이라고 지우면 안 된다 — 같은 세트의 형제가 이미 쓰이고 있어서,
 * 반쪽만 남기면 다음에 쓸 때 색이 어긋난다. 여기 없는 참조-0 토큰은 제거 대상이다.
 */
export const RESERVED_TOKENS = [
  // Hero 카테고리 2·3 (1은 TopPromoBannerClient 에서 사용 중)
  '--hero-2-from', '--hero-2-mid', '--hero-2-to',
  '--hero-3-from', '--hero-3-mid', '--hero-3-to',
  // 강조 보더 — surface-coral 세트의 형제
  '--border-coral-soft',
] as const

/**
 * 🔴 **토큰은 `var(--x)` 로만 참조되는 게 아니다.**
 *  `IconMenu` 는 토큰 이름을 문자열로 들고 다니며 런타임에 `var()` 를 만든다
 *  (`strokeVar: '--icon-best-stroke'`). 이 형태를 못 보면 멀쩡히 쓰는 토큰을
 *  "참조 0" 으로 오판한다 — 실제로 2026-09-15 1차 진단이 그렇게 틀렸다.
 *  사용 여부를 세는 도구는 **두 형태를 모두** 봐야 한다.
 */
export const TOKEN_REFERENCE_FORMS = ['var(--x)', "'--x' (문자열 레지스트리)"] as const

// ──────────────────────────────────────────────────────────────
// 3. 밀도 · 컨트롤 크기
// ──────────────────────────────────────────────────────────────

/** 컨트롤 밀도. public 은 터치, admin 은 compact 가 기본이다. */
export type Density = 'touch' | 'desktop' | 'compact'

/**
 * 밀도별 최소 컨트롤 높이(px). 값의 정본은 CSS 토큰이고 여기는 **검증용 사본**이다
 * (계약 테스트가 둘이 어긋나면 실패시킨다).
 */
export const CONTROL_HEIGHT: Record<Density, number> = {
  touch: 52,   // --control-h-touch   · public/mobile 기본
  desktop: 48, // --control-h-desktop · public/desktop
  compact: 36, // --control-h-compact · admin 전용
}

/**
 * 🔴 **admin 에 52px 를 강제하지 않는다.**
 *  터치 규칙은 실사용자가 손가락으로 쓰는 공개면의 계약이다.
 *  admin 은 포인터 입력 + 고밀도 표가 목적이라 같은 규칙을 적용하면 화면이 깨진다.
 */
export const TOUCH_RULE_SCOPE = 'public' as const

// ──────────────────────────────────────────────────────────────
// 4. CSS 변수를 쓸 수 **없는** 문맥
// ──────────────────────────────────────────────────────────────

/**
 * 여기서는 색을 하드코딩해야 한다 — 토큰 우회가 아니라 **기술적 제약**이다.
 * audit 이 이 경로를 예외로 둔다.
 */
export const NO_CSS_VAR_CONTEXTS = [
  {
    id: 'og-satori',
    reason: 'OG 이미지(next/og·Satori)는 CSS 변수를 해석하지 않는다 — 인라인 값만 렌더된다',
    paths: ['opengraph-image'],
  },
  {
    id: 'svg-attribute',
    reason: 'SVG presentation attribute(fill·stroke)는 CSS 변수를 못 받는 경우가 있다',
    paths: ['src/components/icons/'],
  },
  {
    id: 'external-brand',
    reason: '카카오 등 외부 브랜드 규정색은 우리가 바꿀 수 없다 — reference 토큰으로만 둔다',
    paths: [],
  },
] as const

export type TokenName =
  | (typeof HSL_TRIPLET_TOKENS)[number]
  | (typeof LITERAL_VALUE_TOKENS)[number]
