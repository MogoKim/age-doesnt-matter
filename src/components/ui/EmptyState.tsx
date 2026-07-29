import { cn } from '@/lib/utils'

/**
 * 빈 상태 공용 컴포넌트 — 서비스 화면의 "점선 카드형" 빈 상태를 그대로 표현한다.
 *
 * 배경: 같은 마크업이 11곳에 복붙돼 있었는데(문구만 다름), 이 컴포넌트는 카드 없는
 * 다른 모양이라 아무도 쓰지 않았다. 실제 화면 모습에 맞춰 고쳐 시각 변화 없이 통일한다.
 *  - icon  : 없으면 렌더하지 않는다(아이콘 없는 빈 상태가 다수) + 장식이라 aria-hidden
 *  - message: <br />를 포함한 JSX 허용
 *  - children: CTA 버튼. 위쪽 간격(mt-4)은 이 컴포넌트가 준다
 */
interface EmptyStateProps {
  /** 이모지 아이콘(선택) */
  icon?: string
  message: React.ReactNode
  /** 보조 문구(선택) */
  sub?: React.ReactNode
  /** CTA 버튼 등 */
  children?: React.ReactNode
  className?: string
}

export default function EmptyState({
  icon,
  message,
  sub,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center bg-card rounded-2xl border-2 border-dashed border-border',
        className,
      )}
    >
      {icon && (
        <span className="text-[56px]" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="text-body text-muted-foreground leading-[1.8]">{message}</p>
      {sub && <p className="text-caption text-muted-foreground leading-[1.8]">{sub}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
