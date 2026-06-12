'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateNickname, checkNicknameForChange } from '@/lib/actions/settings'
import { validateNicknameFormat, NICKNAME_MIN, NICKNAME_MAX } from '@/lib/nickname'

interface NicknameSettingsProps {
  currentNickname: string
  canChange: boolean
  lastChangedAt: string | null
}

type NicknameStatus = 'idle' | 'checking' | 'valid' | 'error'

export default function NicknameSettings({ currentNickname, canChange, lastChangedAt }: NicknameSettingsProps) {
  const [nickname, setNickname] = useState(currentNickname)
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>('idle')
  const [nicknameError, setNicknameError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 입력 중 실시간 확인 — 형식·중복(본인 제외)을 서버에서 검사. 가입 온보딩과 동일 UX.
  const checkFromServer = useCallback(async (value: string) => {
    setNicknameStatus('checking')
    try {
      const result = await Promise.race([
        checkNicknameForChange(value),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ])
      if (result.available) {
        setNicknameStatus('valid')
        setNicknameError('')
      } else {
        setNicknameStatus('error')
        setNicknameError(result.error || '사용할 수 없는 닉네임이에요')
      }
    } catch {
      // 네트워크/서버 지연 — ⏳ 무한정체 대신 재시도 안내 (재입력 시 재검증)
      setNicknameStatus('error')
      setNicknameError('확인이 지연돼요. 잠시 후 다시 시도해 주세요')
    }
  }, [])

  function handleNicknameChange(value: string) {
    setNickname(value)
    setNicknameStatus('idle')
    setNicknameError('')
    setMessage('')
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim() === currentNickname) return // 현재 닉네임 그대로면 검증 불필요

    const formatError = validateNicknameFormat(value)
    if (formatError) {
      if (value.length > 0) {
        setNicknameStatus('error')
        setNicknameError(formatError)
      }
      return
    }
    debounceRef.current = setTimeout(() => checkFromServer(value), 250)
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  function handleSave() {
    if (!canChange || nicknameStatus !== 'valid' || nickname.trim() === currentNickname || isPending) return
    setMessage('')

    startTransition(async () => {
      const result = await updateNickname(nickname)
      if (result.error) {
        setMessage(result.error)
        setIsError(true)
      } else {
        setMessage('닉네임이 변경되었어요')
        setIsError(false)
        setNicknameStatus('idle')
      }
    })
  }

  const nextChangeDate = lastChangedAt
    ? new Date(new Date(lastChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR')
    : null

  const saveDisabled = isPending || !canChange || nicknameStatus !== 'valid' || nickname.trim() === currentNickname

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={nickname}
            onChange={(e) => handleNicknameChange(e.target.value)}
            maxLength={NICKNAME_MAX}
            disabled={!canChange}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              'w-full h-[52px] px-3 md:px-4 pr-10 border rounded-xl text-body text-foreground bg-background outline-none transition-colors disabled:bg-muted disabled:text-muted-foreground lg:h-12',
              nicknameStatus === 'valid'
                ? 'border-success focus:border-success'
                : nicknameStatus === 'error'
                  ? 'border-destructive focus:border-destructive'
                  : 'border-border focus:border-primary',
            )}
            placeholder="닉네임 입력"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg pointer-events-none">
            {nicknameStatus === 'valid' && '✅'}
            {nicknameStatus === 'error' && '❌'}
            {nicknameStatus === 'checking' && '⏳'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveDisabled}
          className="shrink-0 whitespace-nowrap h-[52px] px-5 bg-primary text-white rounded-xl text-body font-bold transition-colors hover:bg-primary/90 disabled:bg-border disabled:cursor-not-allowed lg:h-12 lg:px-5"
        >
          {isPending ? '변경 중...' : '변경'}
        </button>
      </div>

      {/* 실시간 검증 안내 */}
      {nicknameStatus === 'error' && nicknameError && (
        <p className="text-[17px] text-destructive font-medium px-1 mt-1">{nicknameError}</p>
      )}
      {nicknameStatus === 'valid' && (
        <p className="text-[17px] text-success font-medium px-1 mt-1">사용 가능한 닉네임이에요</p>
      )}
      {nicknameStatus === 'checking' && (
        <p className="text-[17px] text-muted-foreground px-1 mt-1">중복 확인 중...</p>
      )}

      {!canChange && nextChangeDate && (
        <p className="text-[17px] text-muted-foreground px-1">
          다음 변경 가능: {nextChangeDate}
        </p>
      )}

      {/* 저장 결과 메시지 */}
      {message && (
        <p className={cn('text-[17px] px-1 mt-1', isError ? 'text-destructive' : 'text-success')}>
          {message}
        </p>
      )}

      <p className="text-[17px] text-muted-foreground mt-2 px-1">
        한글, 영문, 숫자 {NICKNAME_MIN}~{NICKNAME_MAX}자 · 30일에 1회 변경 가능
      </p>
    </div>
  )
}
