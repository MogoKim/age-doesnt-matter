/**
 * 우나어 커스텀 아이콘 세트
 *
 * 디자인 원칙:
 * - 2px 둥근 라인 (round cap/join) — 따뜻하고 부드러운 느낌
 * - 유기적이고 둥근 형태 — 딱딱한 기하학 피함
 * - filled prop으로 활성 상태 전환 — outline ↔ filled
 * - currentColor 상속 — 부모 text-color 자동 적용
 */

interface IconProps {
  size?: number
  className?: string
  filled?: boolean
}

/** 베스트 — 별 */
export function IconBest({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l2.5 5.2 5.7.8-4.1 4 1 5.7L12 15.8l-5.1 2.9 1-5.7-4.1-4 5.7-.8L12 3z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 내 일 찾기 — 서류가방 */
export function IconJobs({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="2.5" y="7.5" width="19" height="12" rx="3"
        stroke="currentColor"
        strokeWidth={2}
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M8.5 7.5V6a2.5 2.5 0 012.5-2.5h2a2.5 2.5 0 012.5 2.5v1.5"
        stroke={filled ? 'hsl(var(--card))' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 사는 이야기 — 둥근 말풍선 */
export function IconStories({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3a9 9 0 00-9 9 8.9 8.9 0 001.4 4.8L3 21l4.2-1.4A9 9 0 1012 3z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      {!filled && (
        <>
          <circle cx="8.5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="15.5" cy="12" r="1" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

/** 활력 충전소 — 부드러운 번개 */
export function IconEnergy({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 2.5L5 13.5h6l-1 8 8-11h-6l1-8z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 매거진 — 펼친 책 */
export function IconMagazine({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 5c-1.5-1.5-4-2-6.5-2S2 4 2 4v15s1.5-1 4-1 4.5.8 6 2c1.5-1.2 3.5-2 6-2s4 1 4 1V4s-1-1-3.5-1S13.5 3.5 12 5z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M12 5v16"
        stroke={filled ? 'hsl(var(--card))' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 검색 — 돋보기 */
export function IconSearch({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth={2} />
      <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

/** 사용자 — 사람 프로필 */
export function IconUser({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle
        cx="12" cy="8.5" r="4"
        stroke="currentColor"
        strokeWidth={2}
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M4.5 21c0-3.3 3.4-6 7.5-6s7.5 2.7 7.5 6"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 알림 — 벨 */
export function IconBell({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M18 8.5a6 6 0 00-12 0c0 6.5-3 8.5-3 8.5h18s-3-2-3-8.5z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M13.7 20a2 2 0 01-3.4 0"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}
