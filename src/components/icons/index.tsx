/**
 * 우나어 커스텀 아이콘 세트 v2
 *
 * 디자인 원칙:
 * - 1.75px 스트로크 — 세련되고 가벼운 느낌
 * - round cap/join — 따뜻하고 유기적
 * - filled prop — outline ↔ filled 활성 전환
 * - currentColor 상속 — 부모 color 자동 적용
 * - 24×24 viewBox 기준 — 일관된 옵티컬 사이즈
 */

interface IconProps {
  size?: number
  className?: string
  filled?: boolean
}

const S = 1.75 // 글로벌 스트로크 두께

// ─── 네비게이션 아이콘 ───

/** 베스트 — 별 (더 균형잡힌 5각 별) */
export function IconBest({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.25l-5.8 3.15 1.1-6.45-4.7-4.6 6.5-.95L12 2.5z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 내 일 찾기 — 서류가방 (모던 라운드) */
export function IconJobs({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="2" y="7" width="20" height="13" rx="3.5"
        stroke="currentColor"
        strokeWidth={S}
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7"
        stroke={filled ? 'hsl(var(--card))' : 'currentColor'}
        strokeWidth={S}
        strokeLinecap="round"
      />
      {!filled && (
        <path
          d="M2 13h20"
          stroke="currentColor"
          strokeWidth={S}
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

/** 사는 이야기 — 말풍선 (클린, 점 없이) */
export function IconStories({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M21 12a8.5 8.5 0 01-1.2 4.4L21 21l-4.6-1.2A8.5 8.5 0 1121 12z"
        stroke="currentColor"
        strokeWidth={S}
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

/** 활력 충전소 — 번개 (부드러운 곡선) */
export function IconEnergy({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 2L4.5 13h6L9 22l9.5-11h-6L13 2z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 매거진 — 펼친 책 (심플) */
export function IconMagazine({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 4.5C3.5 3.5 6 3 8.5 3c2.2 0 3.5.7 3.5.7V20s-1.3-.7-3.5-.7c-2.5 0-5 .5-6.5 1.5V4.5z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M22 4.5C20.5 3.5 18 3 15.5 3c-2.2 0-3.5.7-3.5.7V20s1.3-.7 3.5-.7c2.5 0 5 .5 6.5 1.5V4.5z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

// ─── 유틸리티 아이콘 ───

/** 검색 — 돋보기 */
export function IconSearch({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7" stroke="currentColor" strokeWidth={S} />
      <path d="M16 16l5 5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    </svg>
  )
}

/** 사용자 — 사람 프로필 */
export function IconUser({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle
        cx="12" cy="8" r="4.5"
        stroke="currentColor"
        strokeWidth={S}
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M4 21c0-3.5 3.6-6.5 8-6.5s8 3 8 6.5"
        stroke="currentColor"
        strokeWidth={S}
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
        d="M18 8A6 6 0 006 8c0 3.5-1.5 5.5-2.5 7a1 1 0 00.8 1.5h15.4a1 1 0 00.8-1.5C19.5 13.5 18 11.5 18 8z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path
        d="M10.3 20a2 2 0 003.4 0"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── 액션 아이콘 ───

/** 하트 — 좋아요/공감 */
export function IconHeart({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 북마크 — 스크랩 */
export function IconBookmark({ size = 24, className, filled }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 7.8C5 5.7 5 4.65 5.44 3.85a4 4 0 011.71-1.71C7.95 1.7 9 1.7 11.1 1.7h1.8c2.1 0 3.15 0 3.95.44a4 4 0 011.71 1.71c.44.8.44 1.85.44 3.95v13.5l-7-4.5-7 4.5V7.8z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** 공유 — 외부 공유 */
export function IconShare({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3v12"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
      <path
        d="M7.5 7.5L12 3l4.5 4.5"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 14v3.5a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5V14"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 깃발 — 신고 */
export function IconFlag({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 22V3"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
      <path
        d="M4 3c2-1.5 4.5-1.5 6.5 0s4.5 1.5 6.5 0 4-1.5 4-1.5v12c-1.5 1-3 1.5-4 1.5s-3-1-6.5 0S4 15 4 15"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/** 눈 — 조회수 */
export function IconEye({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={S} />
    </svg>
  )
}

/** 말풍선 — 댓글 */
export function IconComment({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3C7 3 3 6.58 3 11c0 2.13.94 4.06 2.5 5.5L4 21l4.5-1.5C9.6 19.8 10.8 20 12 20c5 0 9-3.58 9-8s-4-9-9-9z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 링크 — 복사/링크 */
export function IconLink({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 카카오톡 — 말풍선 */
export function IconKakao({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3C6.48 3 2 6.58 2 10.9c0 2.77 1.85 5.2 4.62 6.58-.15.53-.96 3.41-.99 3.63 0 0-.02.17.09.24.11.06.24.01.24.01.32-.05 3.7-2.44 4.28-2.85.57.08 1.15.13 1.76.13 5.52 0 10-3.58 10-7.74C22 6.58 17.52 3 12 3z"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 클립보드 — 복사 */
export function IconCopy({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="9" y="9" width="12" height="12" rx="2.5"
        stroke="currentColor"
        strokeWidth={S}
      />
      <path
        d="M5 15H4.5A2.5 2.5 0 012 12.5v-8A2.5 2.5 0 014.5 2h8A2.5 2.5 0 0115 4.5V5"
        stroke="currentColor"
        strokeWidth={S}
        strokeLinecap="round"
      />
    </svg>
  )
}
