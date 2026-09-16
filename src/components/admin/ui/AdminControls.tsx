'use client'

import * as React from 'react'

import { Button, type ButtonProps } from '@/components/ui/Button'
import { Input, Select, Textarea, type InputProps, type SelectProps, type TextareaProps } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

/**
 * 어드민 컨트롤 — **공용 primitive 위에 어드민 스킨 하나**.
 *
 * ── 왜 만들었나 ──────────────────────────────────────────────
 *  어드민 5개 화면에서 똑같은 클래스 문자열이 반복되고 있었다(2026-09-16 실측):
 *    `h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500`
 *  → 입력 필드에서만 **20회**. 한 글자 다른 변종도 섞여 있었다.
 *  스킨을 여기 한 곳에 두고, 나머지는 공용 `Input`·`Select`·`Textarea`·`Button` 이 맡는다.
 *
 * ── 🔴 이 배치는 리디자인이 아니다 ────────────────────────────
 *  크기·색·문구를 **그대로** 유지한다.
 *   · 높이 `h-10`(40px) 유지 — `density="compact"` 의 최소 높이(36px)를 덮어쓴다.
 *     어드민에 52px 터치 규칙을 강제하지 않는다는 계약은 그대로다(`design-tokens.ts`).
 *   · 색은 zinc 팔레트 유지 — 공용 기본값(`bg-background`·`shadow-sm`)을 끈다.
 *   · focus 는 기존 `border-zinc-500` 을 **그대로 두고**, 공용 `focus-visible` 링을 **더한다**.
 *     링은 키보드 포커스에만 뜨므로 마우스 사용자의 화면은 바뀌지 않는다. 제거가 아니라 추가다.
 */

/** 어드민 입력 스킨 — 공용 기본 스킨을 어드민 현행 모습으로 덮는다. */
const ADMIN_FIELD = 'h-10 bg-white shadow-none border-zinc-300 focus:border-zinc-500'

/** 어드민 기본(강조) 버튼 — 기존 `bg-zinc-900` 계열. */
const ADMIN_PRIMARY = 'bg-zinc-900 text-white hover:bg-zinc-800 font-medium'
/** 어드민 보조 버튼 — 기존 테두리형. */
const ADMIN_SECONDARY = 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 font-medium'

export function AdminInput({ className, ...props }: InputProps) {
  return <Input density="compact" className={cn(ADMIN_FIELD, className)} {...props} />
}

export function AdminTextarea({ className, ...props }: TextareaProps) {
  // textarea 는 높이를 행 수가 정한다 — `h-10` 을 넣으면 한 줄로 눌린다.
  return <Textarea density="compact" className={cn('bg-white shadow-none border-zinc-300 focus:border-zinc-500', className)} {...props} />
}

export function AdminSelect({ className, ...props }: SelectProps) {
  return <Select density="compact" className={cn(ADMIN_FIELD, className)} {...props} />
}

/**
 * 표 **행 안의** 인라인 액션 버튼 — `수정`·`삭제`·`활성/비활성` 같은 것.
 *
 * 🔴 `AdminButton` 과 따로 두는 이유: 행 높이다.
 *    compact 최소 높이(36px)를 적용하면 표가 세로로 벌어져 한 화면에 보이는 행 수가 준다.
 *    어드민은 고밀도 표가 목적이라 그건 기능 저하다. 그래서 **높이를 콘텐츠가 정한다.**
 *    `rounded px-2 py-1 text-xs` 는 5개 화면에 반복되던 조합이다 — 여기 한 곳으로 모은다.
 */
export interface AdminInlineButtonProps extends Omit<ButtonProps, 'variant' | 'density' | 'size'> {
  /** 위험 동작(삭제 등)은 `danger` — 빨강 계열을 쓴다. */
  tone?: 'default' | 'danger'
}

export function AdminInlineButton({ tone = 'default', className, ...props }: AdminInlineButtonProps) {
  return (
    <Button
      variant="ghost"
      density="compact"
      className={cn(
        // `min-h-0` 로 compact 최소 높이를 푼다 — 행 높이를 지키기 위한 의도적 예외다.
        'min-h-0 rounded px-2 py-1 text-xs font-medium',
        tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-zinc-700 hover:bg-zinc-100',
        className,
      )}
      {...props}
    />
  )
}

export interface AdminButtonProps extends Omit<ButtonProps, 'variant' | 'density'> {
  /** `primary` = 강조(zinc-900) · `secondary` = 테두리형 · `ghost` = 배경 없음 */
  tone?: 'primary' | 'secondary' | 'ghost'
}

export function AdminButton({ tone = 'primary', className, ...props }: AdminButtonProps) {
  const skin =
    tone === 'primary' ? ADMIN_PRIMARY : tone === 'secondary' ? ADMIN_SECONDARY : 'text-zinc-600 hover:bg-zinc-100'
  return (
    <Button
      variant="ghost"
      density="compact"
      className={cn('rounded-lg px-4 py-2', skin, className)}
      {...props}
    />
  )
}
