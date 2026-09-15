import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * 폼 컨트롤 3종 — `Input` · `Textarea` · `Select`.
 *
 * ── 계약 (`src/lib/design-tokens.ts`) ────────────────────────────
 *  · 크기는 밀도 토큰으로만: `min-h-control`(52px) / `min-h-control-compact`(36px). px 를 직접 적지 않는다.
 *  · disabled·focus 는 state 토큰(`opacity-disabled`·`ring-focus`).
 *  · **error 는 시각 표시로 끝나지 않는다** — `aria-invalid` + `aria-describedby` 로 묶는다.
 *    색만 바꾸면 스크린리더 사용자는 무엇이 틀렸는지 알 수 없다.
 *  · label 이 있으면 `htmlFor` 로 연결한다. 없으면 호출부가 `aria-label` 을 준다.
 *
 * 🔴 admin 은 `density="compact"` 를 쓴다 — 52px 를 강제하지 않는다.
 */

type Density = 'touch' | 'compact'

const FIELD_BASE =
  'w-full rounded-lg border bg-background text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-focus focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-disabled'

const DENSITY_CLASS: Record<Density, string> = {
  touch: 'min-h-control px-4 py-2 text-body',
  compact: 'min-h-control-compact px-3 py-1 text-sm',
}

function fieldClass(density: Density, hasError: boolean, className?: string) {
  return cn(
    FIELD_BASE,
    DENSITY_CLASS[density],
    hasError ? 'border-destructive focus-visible:ring-destructive' : 'border-input',
    className,
  )
}

interface FieldShellProps {
  id: string
  label?: string
  error?: string
  success?: string
  density: Density
  children: React.ReactNode
}

/** label·error·success 배치를 3종이 공유한다 — 폼마다 다르게 조립되던 것을 하나로 모은다. */
function FieldShell({ id, label, error, success, density, children }: FieldShellProps) {
  const textSize = density === 'compact' ? 'text-sm' : 'text-body'
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className={cn(textSize, 'font-medium text-foreground')}>
          {label}
        </label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className={cn(textSize, 'text-destructive')} role="alert">
          {error}
        </p>
      )}
      {success && !error && <p className={cn(textSize, 'text-success')}>{success}</p>}
    </div>
  )
}

/**
 * 필드 id — **명시적 id 가 없으면 항상 `React.useId()`**.
 *
 * 🔴 label 에서 id 를 만들면 **같은 라벨이 두 번 나올 때 id 가 충돌한다.**
 *    (예: 폼 두 개에 각각 "닉네임" 입력이 있는 화면) 충돌하면 `htmlFor` 가
 *    엉뚱한 입력을 가리키고, 클릭 포커스와 스크린리더 읽기가 서로 뒤바뀐다.
 *    `useId` 는 렌더마다 고유하고 SSR/CSR 간에도 일치한다.
 */
function useFieldId(id: string | undefined) {
  const auto = React.useId()
  return id ?? auto
}

export interface InputProps extends React.ComponentProps<'input'> {
  label?: string
  error?: string
  success?: string
  density?: Density
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, success, id, density = 'touch', ...props }, ref) => {
    const inputId = useFieldId(id)
    return (
      <FieldShell id={inputId} label={label} error={error} success={success} density={density}>
        <input
          type={type}
          id={inputId}
          className={cn('flex', fieldClass(density, Boolean(error), className))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          ref={ref}
          {...props}
        />
      </FieldShell>
    )
  },
)
Input.displayName = 'Input'

export interface TextareaProps extends React.ComponentProps<'textarea'> {
  label?: string
  error?: string
  success?: string
  density?: Density
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, success, id, density = 'touch', rows = 4, ...props }, ref) => {
    const fieldId = useFieldId(id)
    return (
      <FieldShell id={fieldId} label={label} error={error} success={success} density={density}>
        <textarea
          id={fieldId}
          rows={rows}
          className={cn('block resize-y', fieldClass(density, Boolean(error), className))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          ref={ref}
          {...props}
        />
      </FieldShell>
    )
  },
)
Textarea.displayName = 'Textarea'

export interface SelectProps extends React.ComponentProps<'select'> {
  label?: string
  error?: string
  density?: Density
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, density = 'touch', children, ...props }, ref) => {
    const fieldId = useFieldId(id)
    return (
      <FieldShell id={fieldId} label={label} error={error} density={density}>
        <select
          id={fieldId}
          className={cn('block', fieldClass(density, Boolean(error), className))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          ref={ref}
          {...props}
        >
          {children}
        </select>
      </FieldShell>
    )
  },
)
Select.displayName = 'Select'

export { Input, Textarea, Select }
