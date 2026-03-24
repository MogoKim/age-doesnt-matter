/**
 * 우나어 커스텀 아이콘 세트
 * 브랜드에 맞는 둥근 라인 스타일 — 따뜻하고 시니어 친화적
 */

interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

const defaults: Required<Pick<IconProps, 'size' | 'strokeWidth'>> = {
  size: 24,
  strokeWidth: 1.8,
}

/** 베스트 — 트로피/왕관 */
export function IconBest({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2l2.4 4.8L20 7.6l-4 3.9.9 5.5L12 14.5 7.1 17l.9-5.5-4-3.9 5.6-.8L12 2z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 내 일 찾기 — 서류가방 */
export function IconJobs({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="7" width="20" height="13" rx="2.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path d="M12 11v3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M2 13h20" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  )
}

/** 사는 이야기 — 말풍선 */
export function IconStories({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M21 12.5a8 8 0 01-1.2 4.2A8.1 8.1 0 0112 20.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.4-5.1A8 8 0 014 12.5a8.1 8.1 0 013.8-7.8A8 8 0 0112 3.5a8 8 0 018 8 8 8 0 011 1z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 활력 충전소 — 번개 */
export function IconEnergy({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 2L4.5 13H12l-1 9 8.5-11H12l1-9z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 매거진 — 펼친 책 */
export function IconMagazine({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 4.5C2 4.5 5 3 8.5 3S15 4.5 15 4.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 4.5v14.5s3-1.5 6.5-1.5S15 19 15 19V4.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 4.5C15 4.5 16.5 3 19 3s3.5 1.5 3.5 1.5v14.5s-1-1.5-3.5-1.5-4 1.5-4 1.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 4.5v14.5" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  )
}

/** 검색 — 돋보기 */
export function IconSearch({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}

/** 사용자 — 프로필 */
export function IconUser({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="4.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M4 20.5c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 알림 — 벨 */
export function IconBell({ size = defaults.size, className, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 01-3.46 0"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
