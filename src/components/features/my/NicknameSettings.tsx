'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateNickname } from '@/lib/actions/settings'

interface NicknameSettingsProps {
  currentNickname: string
  canChange: boolean
  lastChangedAt: string | null
}

export default function NicknameSettings({ currentNickname, canChange, lastChangedAt }: NicknameSettingsProps) {
  const [nickname, setNickname] = useState(currentNickname)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  function handleSave() {
    if (!canChange || nickname.trim() === currentNickname) return
    setMessage('')

    startTransition(async () => {
      const result = await updateNickname(nickname)
      if (result.error) {
        setMessage(result.error)
        setIsError(true)
      } else {
        setMessage('닉네임이 변경되었어요')
        setIsError(false)
      }
    })
  }

  const nextChangeDate = lastChangedAt
    ? new Date(new Date(lastChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR')
    : null

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          disabled={!canChange}
          className="flex-1 h-[52px] px-4 border border-border rounded-xl text-base text-foreground bg-background outline-none transition-colors focus:border-primary disabled:bg-muted disabled:text-muted-foreground lg:h-12"
          placeholder="닉네임 입력"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !canChange || nickname.trim() === currentNickname}
          className="h-[52px] px-5 bg-primary text-white rounded-xl text-base font-bold transition-colors hover:bg-[#E85D50] disabled:bg-border disabled:cursor-not-allowed shrink-0 lg:h-12"
        >
          {isPending ? '변경 중...' : '변경'}
        </button>
      </div>

      {!canChange && nextChangeDate && (
        <p className="text-sm text-muted-foreground px-1">
          다음 변경 가능: {nextChangeDate}
        </p>
      )}

      {message && (
        <p className={cn('text-sm px-1 mt-1', isError ? 'text-destructive' : 'text-green-600')}>
          {message}
        </p>
      )}

      <p className="text-[13px] text-muted-foreground mt-2 px-1">
        한글, 영문, 숫자 2~12자 · 30일에 1회 변경 가능
      </p>
    </div>
  )
}
