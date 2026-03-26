'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { updateFontSize } from '@/lib/actions/settings'

const FONT_SIZES = [
  { value: 'NORMAL', label: '보통', desc: '기본 크기' },
  { value: 'LARGE', label: '크게', desc: '본문 20px' },
  { value: 'XLARGE', label: '아주크게', desc: '본문 24px' },
] as const

interface FontSizeSettingsProps {
  currentSize: string
}

export default function FontSizeSettings({ currentSize }: FontSizeSettingsProps) {
  const router = useRouter()
  const [selected, setSelected] = useState(currentSize)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  const PREVIEW_SIZE_MAP: Record<string, string> = { NORMAL: '17px', LARGE: '20px', XLARGE: '24px' }
  const previewSize = PREVIEW_SIZE_MAP[selected] ?? '17px'

  function handleSave() {
    if (selected === currentSize) return
    setMessage('')

    startTransition(async () => {
      const result = await updateFontSize(selected)
      if (result.error) {
        setMessage(result.error)
      } else {
        // localStorage에도 저장 → 다른 페이지에서 즉시 적용
        localStorage.setItem('unao-font-size', selected)
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
                ? 'border-primary bg-primary/5 text-primary font-medium'
                : 'border-border bg-background text-foreground hover:border-primary/30',
            )}
          >
            <span className="flex-1 text-body">{option.label}</span>
            <span className="text-sm text-muted-foreground">{option.desc}</span>
          </button>
        ))}
      </div>

      {message && (
        <p className={cn('text-sm mb-3 px-1', message.includes('변경') ? 'text-green-600' : 'text-destructive')}>
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || selected === currentSize}
        className="w-full h-[52px] bg-primary text-white rounded-xl text-body font-bold transition-colors hover:bg-[#E85D50] disabled:bg-border disabled:cursor-not-allowed lg:h-12"
      >
        {isPending ? '적용 중...' : '적용하기'}
      </button>
    </div>
  )
}
