'use client'

import { cn } from '@/lib/utils'
import { useFontSize } from '@/components/common/FontSizeProvider'

// 가/가/가 글자 크기 = CSS 변수(caption<title<heading) → ① 셋 간 크기 차이(미리보기) 유지
//   ② 글씨크기 토글(data-font-size)에 footer 다른 텍스트와 함께 반응해 커짐.
const SIZES = [
  { key: 'NORMAL', label: '가', a11y: '보통', class: 'text-caption' },
  { key: 'LARGE', label: '가', a11y: '크게', class: 'text-title' },
  { key: 'XLARGE', label: '가', a11y: '아주 크게', class: 'text-heading' },
] as const

export default function FooterFontSizeToggle() {
  const { fontSize, setFontSize } = useFontSize()

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3.5 pr-1.5"
      role="radiogroup"
      aria-label="글씨 크기 조절"
    >
      <span className="mr-1 text-caption text-muted-foreground">글씨 크기</span>
      {SIZES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={fontSize === s.key}
          aria-label={`글씨 ${s.a11y}`}
          onClick={() => setFontSize(s.key)}
          className={cn(
            'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2 transition-all',
            fontSize === s.key ? 'bg-white font-bold text-primary-text shadow-sm' : 'text-muted-foreground hover:bg-white/60'
          )}
        >
          {/* 글자 크기는 span에 직접(cn 미사용) — ① button{font-size:inherit}(globals) 회피
              ② cn/twMerge가 text-caption(크기)을 text-색상과 충돌로 제거하는 것 회피.
              caption<title<heading = 미리보기 크기 차이 + 글씨크기 토글에 함께 반응. 색은 button 상속 */}
          <span className={`leading-none ${s.class}`}>{s.label}</span>
        </button>
      ))}
    </div>
  )
}
