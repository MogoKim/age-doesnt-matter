import { getCategoryChipClass } from '@/lib/category-chip'

/**
 * 카테고리·보드 배지 공용 컴포넌트.
 *
 * 배경: 같은 성격의 배지가 화면마다 radius/padding/굵기가 달라 5종으로 흩어져 있었다.
 * 색상은 이미 getCategoryChipClass() 하나로 공용화돼 있었고 갈린 건 모양뿐이라,
 * 모양만 두 variant로 정리한다(모든 화면을 같은 크기로 강제하지 않는다).
 *
 *  - default: 카드형 목록(게시판 목록·/best·마이페이지·검색). 기존 PostCard 배지와 동일.
 *  - compact: 밀집 리스트·썸네일(홈 섹션). 기존 홈 pill과 동일.
 *
 * ⚠️ cn()(=clsx + tailwind-merge)을 쓰지 않고 템플릿 문자열로 조립한다.
 * 교체 전 8개 호출부가 모두 템플릿 문자열이었고, 여기에 cn()을 도입하면 두 가지가 깨진다.
 *   1) text-caption: twMerge가 커스텀 폰트 유틸을 "글자색" 그룹으로 오인해,
 *      뒤에 오는 text-[var(--cat-*-text)]가 폰트 크기 클래스를 지운다(실제 회귀 이력).
 *   2) leading: twMerge는 font-size와 line-height를 충돌 그룹으로 보고 leading-*를 지운다.
 *      (text-xs로 우회해도 tailwind.config의 text-xs가 line-height 1.4를 함께 지정해
 *       default 배지가 5px 낮아진다 — 실측으로 확인)
 * twMerge를 거치지 않으므로 text-caption(font-size만 지정)을 그대로 쓸 수 있고,
 * default는 기존처럼 line-height를 상속(1.75)해 교체 전과 픽셀이 같다.
 * → .claude/rules/ui-components.md "cn() + 글씨 크기 토큰 규칙"
 *
 * 여백(mb-1.5 등)은 배지 스타일이 아니라 호출부 레이아웃이므로 className으로 받는다.
 */
interface CategoryBadgeProps {
  /** 색상 토큰 결정용 보드 타입(STORY·MENOPAUSE·MAGAZINE 등) */
  boardType: string
  /** 표시 문구(보드 이름 또는 카테고리명) */
  label: React.ReactNode
  variant?: 'default' | 'compact'
  /** 호출부 여백 등 */
  className?: string
}

const VARIANT_CLASS = {
  // line-height 미지정 = 상속(1.75). 교체 전 PostCard 배지와 동일.
  default: 'rounded-full px-3 py-1 text-caption font-bold tracking-wide',
  // 교체 전 홈 배지가 명시하던 leading-[1.4] 유지.
  compact: 'rounded-full px-2 py-0.5 text-caption font-medium leading-[1.4]',
} as const

export default function CategoryBadge({
  boardType,
  label,
  variant = 'default',
  className,
}: CategoryBadgeProps) {
  const classes = [
    'inline-flex items-center w-fit',
    VARIANT_CLASS[variant],
    getCategoryChipClass(boardType),
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{label}</span>
}
