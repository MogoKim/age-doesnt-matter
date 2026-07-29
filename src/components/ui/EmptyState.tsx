import { cn } from '@/lib/utils'

/**
 * 빈 상태 공용 컴포넌트 — 서비스 화면의 "점선 카드형" 빈 상태를 그대로 표현한다.
 *
 * 배경: 같은 마크업이 11곳에 복붙돼 있었는데(문구만 다름), 이 컴포넌트는 카드 없는
 * 다른 모양이라 아무도 쓰지 않았다. 실제 화면 모습에 맞춰 고쳐 시각 변화 없이 통일한다.
 *  - icon  : 없으면 렌더하지 않는다(아이콘 없는 빈 상태가 다수) + 장식이라 aria-hidden
 *  - message: <br />를 포함한 JSX 허용
 *  - title : 있으면 "굵은 제목 + 작은 설명" 2단으로 렌더한다(명예의 전당 형태)
 *  - 자식 간 간격은 컨테이너 gap-4(16px)가 준다. 기존 소비처는 자식이
 *    문단+CTA 둘뿐이라 이전 mt-4(16px)와 간격이 동일하다.
 */
interface EmptyStateProps {
  /** 이모지 아이콘(선택) */
  icon?: string
  /** 강조 제목(선택). 주면 message가 설명 문구(작은 글씨)로 내려간다 */
  title?: React.ReactNode
  message: React.ReactNode
  /** 보조 문구(선택) */
  sub?: React.ReactNode
  /** CTA 버튼 등 */
  children?: React.ReactNode
  className?: string
}

export default function EmptyState({
  icon,
  title,
  message,
  sub,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-8 text-center bg-card rounded-2xl border-2 border-dashed border-border',
        className,
      )}
    >
      {icon && (
        <span className="text-[56px]" aria-hidden="true">
          {icon}
        </span>
      )}
      {title ? (
        // 제목과 설명은 한 덩어리로 묶어 gap-4(16px)가 아닌 mb-1(4px)로 붙인다.
        <div>
          <p className="text-body font-bold text-foreground mb-1">{title}</p>
          <p className="text-caption text-muted-foreground leading-[1.8]">{message}</p>
        </div>
      ) : (
        <p className="text-body text-muted-foreground leading-[1.8]">{message}</p>
      )}
      {sub && <p className="text-caption text-muted-foreground leading-[1.8]">{sub}</p>}
      {children && <div>{children}</div>}
    </div>
  )
}
