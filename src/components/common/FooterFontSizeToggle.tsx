'use client'

import { cn } from '@/lib/utils'
import { useFontSize } from '@/components/common/FontSizeProvider'

const SIZES = [
  { key: 'NORMAL', label: '가', a11y: '보통', class: 'text-[14px]' },
  { key: 'LARGE', label: '가', a11y: '크게', class: 'text-[16px]' },
  { key: 'XLARGE', label: '가', a11y: '아주 크게', class: 'text-[19px]' },
] as const

// 동작(useFontSize·setFontSize·SIZES 3단계)은 그대로, 스타일만 컴팩트 알약 그룹으로.
export default function FooterFontSizeToggle() {
  const { fontSize, setFontSize } = useFontSize()

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full bg-[#F7F7F8] py-[5px] pl-[13px] pr-[6px]"
      role="radiogroup"
      aria-label="글씨 크기 조절"
    >
      <span className="mr-1 text-[11px] text-muted-foreground">글씨 크기</span>
      {SIZES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={fontSize === s.key}
          aria-label={`글씨 ${s.a11y}`}
          onClick={() => setFontSize(s.key)}
          className={cn(
            'flex h-[31px] min-h-[31px] w-[31px] items-center justify-center rounded-full leading-none transition-all',
            s.class,
            fontSize === s.key
              ? 'bg-white font-bold text-primary-text shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
