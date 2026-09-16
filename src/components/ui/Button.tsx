import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * 표준 명령 버튼.
 *
 * ── 계약 (`src/lib/design-tokens.ts`) ────────────────────────────
 *  · **크기는 밀도 토큰으로만** 정한다 — `control`(52px) / `control-desktop`(48px) /
 *    `control-lg`(56px) / `control-compact`(36px). 화면에 px 를 직접 적지 않는다 —
 *    그 수치가 흩어지면 터치 규칙이 어디서 깨졌는지 알 수 없다(공개면 306곳을 토큰으로 옮겼다).
 *  · **disabled / focus 는 state 토큰**을 쓴다(`opacity-disabled`·`ring-focus`·`ring-offset-focus`).
 *    값은 기존과 같다(0.5 · 2px · 2px) — 컴포넌트마다 제각각 정하지 못하게 하려는 것이다.
 *  · **loading 은 disabled 를 포함한다.** 로딩 중 재클릭으로 중복 제출되는 사고를 막는다.
 *
 * ── 밀도 ────────────────────────────────────────────────────────
 *  🔴 **admin 에 52px 를 강제하지 않는다.** 터치 규칙은 손가락으로 쓰는 공개면의 계약이다.
 *     admin 은 포인터 입력 + 고밀도 표라 `density="compact"` 를 쓴다.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 break-keep rounded-lg text-center font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-focus focus-visible:ring-ring focus-visible:ring-offset-focus disabled:pointer-events-none disabled:opacity-disabled select-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.98]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-primary text-primary-text bg-background shadow-sm hover:bg-primary/5',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary-text underline-offset-4 hover:underline',
      },
      density: {
        touch: 'text-body [&_svg]:size-5',
        compact: 'text-sm [&_svg]:size-4',
      },
      size: { default: '', sm: '', lg: '', icon: '' },
    },
    compoundVariants: [
      // touch — 모바일 52px, lg 뷰포트에서 48px(포인터). 기존 클래스와 값이 같다.
      { density: 'touch', size: 'default', class: 'min-h-control px-6 py-2 w-full lg:min-h-control-desktop lg:w-auto lg:min-w-[120px]' },
      { density: 'touch', size: 'sm', class: 'min-h-control rounded-lg px-4 py-2 lg:min-h-control-desktop' },
      { density: 'touch', size: 'lg', class: 'min-h-control-lg rounded-lg px-8 py-2 text-lg' },
      { density: 'touch', size: 'icon', class: 'h-control w-control lg:h-control-desktop lg:w-control-desktop' },
      // compact — admin 전용.
      { density: 'compact', size: 'default', class: 'min-h-control-compact px-4 py-1.5' },
      { density: 'compact', size: 'sm', class: 'min-h-control-compact px-3 py-1' },
      { density: 'compact', size: 'lg', class: 'min-h-control-desktop px-6 py-2' },
      { density: 'compact', size: 'icon', class: 'h-control-compact w-control-compact' },
    ],
    defaultVariants: { variant: 'default', size: 'default', density: 'touch' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, density, asChild = false, isLoading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, density, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        aria-disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && (
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

/**
 * 아이콘 전용 버튼.
 *
 * `Button size="icon"` 과 같은 것을 쓰되 **접근 이름을 강제**한다 —
 * 아이콘만 있는 버튼은 라벨이 없으면 스크린리더에서 정체를 알 수 없다.
 * 새 추상화가 아니라 `Button` 위의 얇은 계약이다.
 */
export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children'> {
  /** 스크린리더용 이름. 필수다. */
  label: string
  children: React.ReactNode
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, children, ...props }, ref) => (
    <Button ref={ref} size="icon" aria-label={label} {...props}>
      {children}
    </Button>
  ),
)
IconButton.displayName = 'IconButton'

export { Button, IconButton, buttonVariants }
