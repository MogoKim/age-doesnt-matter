'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { updateFontSize } from '@/lib/actions/settings'
import { useFontSize } from '@/components/common/FontSizeProvider'
import { FONT_SIZE_VALUES, FONT_SIZE_LABELS, FONT_SIZE_BODY_PX } from '@/lib/font-size-labels'

// 보이는 이름·크기 안내는 font-size-labels 한 곳에서 가져온다 — 화면마다 다르게 부르던 걸 맞췄다.
const FONT_SIZES = FONT_SIZE_VALUES.map((value) => ({
  value,
  label: FONT_SIZE_LABELS[value],
  desc: `본문 ${FONT_SIZE_BODY_PX[value]}`,
}))

interface FontSizeSettingsProps {
  currentSize: string
}

export default function FontSizeSettings({ currentSize }: FontSizeSettingsProps) {
  const router = useRouter()
  // 화면에 실제 적용된 값이 기준이다. DB(currentSize)는 기본값 '크게' 상향 이후 실제 화면과 어긋날 수 있다
  // (미설정 사용자는 DB=NORMAL이지만 화면은 LARGE) → 이 값으로 맞춰야 헤더 가+ 표시와 일치한다.
  const { fontSize: applied, setFontSize } = useFontSize()
  const [selected, setSelected] = useState<string>(currentSize)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  // 마운트 후 localStorage 폴백까지 끝난 실제 적용값으로 동기화
  useEffect(() => {
    setSelected(applied)
  }, [applied])

  const previewSize = FONT_SIZE_BODY_PX[selected as keyof typeof FONT_SIZE_BODY_PX] ?? FONT_SIZE_BODY_PX.NORMAL

  // 화면과 다르거나 DB와 다르면 저장 가능 (DB만 어긋난 경우도 정합성을 맞출 수 있게)
  const isDirty = selected !== applied || selected !== currentSize

  function handleSave() {
    if (!isDirty) return
    setMessage('')

    startTransition(async () => {
      const result = await updateFontSize(selected)
      if (result.error) {
        setMessage(result.error)
      } else {
        // 즉시 반영: FontSizeProvider가 data-font-size + localStorage + cookie 처리 (footer 토글과 동일 경로)
        setFontSize(selected as 'NORMAL' | 'LARGE' | 'XLARGE')
        setMessage('글자 크기가 변경되었어요')
        router.refresh()
      }
    })
  }

  return (
    <div>
      {/* 미리보기 */}
      <div className="bg-background rounded-xl p-4 mb-4 border border-border">
        <p className="text-foreground m-0 leading-relaxed" style={{ fontSize: previewSize }}>
          오늘 시장에서 옥수수를 샀는데 정말 맛있더라구요
        </p>
      </div>

      {/* 크기 선택 */}
      <div className="space-y-2 mb-4">
        {FONT_SIZES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setSelected(option.value)}
            className={cn(
              'flex items-center w-full min-h-[52px] px-4 rounded-xl border transition-colors text-left',
              selected === option.value
                ? 'border-primary bg-primary/5 text-primary-text font-medium'
                : 'border-border bg-background text-foreground hover:border-primary/30',
            )}
          >
            <span className="flex-1 text-body">{option.label}</span>
            <span className="text-[17px] text-muted-foreground">{option.desc}</span>
          </button>
        ))}
      </div>

      {message && (
        <p className={cn('text-[17px] mb-3 px-1', message.includes('변경') ? 'text-success' : 'text-destructive')}>
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !isDirty}
        className="w-full h-[52px] bg-primary text-white rounded-xl text-body font-bold transition-colors hover:bg-primary/90 disabled:bg-border disabled:cursor-not-allowed lg:h-12"
      >
        {isPending ? '적용 중...' : '적용하기'}
      </button>
    </div>
  )
}
