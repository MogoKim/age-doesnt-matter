'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { checkNickname, completeOnboarding } from '@/lib/actions/onboarding'
import { gtmSignUp } from '@/lib/gtm'

// ── 닉네임 유효성 검사 ──
const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]+$/
const BANNED_WORDS = ['운영자', '관리자', 'admin', '어드민', '관리인']

type NicknameStatus = 'idle' | 'checking' | 'valid' | 'error'

function validateNickname(value: string): string | null {
  if (value.length < 2) return '2자 이상 입력해 주세요'
  if (value.length > 10) return '10자 이하로 입력해 주세요'
  if (!NICKNAME_REGEX.test(value)) return '한글, 영문, 숫자만 사용할 수 있어요'
  const lower = value.toLowerCase()
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return '사용할 수 없는 닉네임이에요'
  }
  return null
}

// ── 약관 항목 ──
interface TermItem {
  id: string
  label: string
  required: boolean
  url?: string
}

const TERMS: TermItem[] = [
  { id: 'service', label: '이용약관 동의', required: true, url: '/terms/service' },
  { id: 'privacy', label: '개인정보처리방침 동의', required: true, url: '/terms/privacy' },
  { id: 'marketing', label: '마케팅 수신 동의', required: false },
]

// ── 메인 컴포넌트 ──
export default function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState('')
  const [isNavigating, setIsNavigating] = useState(false)

  // Step 1 - 닉네임
  const [nickname, setNickname] = useState('')
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>('idle')
  const [nicknameError, setNicknameError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 2 - 약관
  const [agreed, setAgreed] = useState<Record<string, boolean>>({
    service: false,
    privacy: false,
    marketing: false,
  })

  const lengthOk = nickname.length >= 2 && nickname.length <= 10
  const charOk = nickname.length === 0 || NICKNAME_REGEX.test(nickname)
  const noBanned = !BANNED_WORDS.some((w) => nickname.toLowerCase().includes(w))

  const checkDuplicateFromServer = useCallback(async (value: string) => {
    setNicknameStatus('checking')
    const result = await checkNickname(value)
    if (result.available) {
      setNicknameStatus('valid')
      setNicknameError('')
    } else {
      setNicknameStatus('error')
      setNicknameError(result.error || '사용할 수 없는 닉네임이에요')
    }
  }, [])

  function handleNicknameChange(value: string) {
    setNickname(value)
    setNicknameStatus('idle')
    setNicknameError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const error = validateNickname(value)
    if (error) {
      if (value.length > 0) {
        setNicknameStatus('error')
        setNicknameError(error)
      }
      return
    }

    debounceRef.current = setTimeout(() => checkDuplicateFromServer(value), 300)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function handleStep1Next() {
    if (nicknameStatus !== 'valid') return
    setStep(2)
  }

  function toggleTerm(id: string) {
    setAgreed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleAll() {
    const allChecked = TERMS.every((t) => agreed[t.id])
    const next: Record<string, boolean> = {}
    for (const t of TERMS) next[t.id] = !allChecked
    setAgreed(next)
  }

  const allRequired = TERMS.filter((t) => t.required).every((t) => agreed[t.id])
  const allChecked = TERMS.every((t) => agreed[t.id])

  function handleSubmit() {
    if (!allRequired || isPending) return
    setSubmitError('')

    startTransition(async () => {
      const result = await completeOnboarding(nickname, {
        service: agreed.service,
        privacy: agreed.privacy,
        marketing: agreed.marketing,
      })
      if (result.error) {
        setSubmitError(result.error)
      } else {
        setStep(3)
      }
    })
  }

  function handleComplete() {
    setIsNavigating(true)
    gtmSignUp('kakao')
    // AddToHomeScreen 마운트 이전에 이벤트가 유실되는 레이스컨디션 방지:
    // sessionStorage에 pending flag를 저장 → 홈 마운트 시 AddToHomeScreen이 처리
    sessionStorage.setItem('pwa_pending', 'signup')
    router.push('/')
    router.refresh()
  }

  // ── 프로그레스 바 (Step 1, 2만) ──
  function renderProgress() {
    return (
      <div className="flex gap-2 mb-8">
        <div
          className={cn(
            'flex-1 h-1 rounded-full transition-colors duration-300',
            step === 1 ? 'bg-primary' : 'bg-green-500',
          )}
        />
        <div
          className={cn(
            'flex-1 h-1 rounded-full transition-colors duration-300',
            step === 2 ? 'bg-primary' : step > 2 ? 'bg-green-500' : 'bg-border',
          )}
        />
      </div>
    )
  }

  // ── Step 1: 닉네임 설정 ──
  if (step === 1) {
    return (
      <div className="w-full max-w-[480px] bg-card rounded-2xl p-8 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col">
        {renderProgress()}

        <div className="mb-8 text-center">
          <span className="text-5xl mb-4 block">👋</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">반가워요!</h1>
          <p className="text-body text-muted-foreground leading-relaxed">
            우나어에서 사용할 닉네임을 정해 주세요
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-caption font-bold text-foreground mb-2" htmlFor="nickname">닉네임</label>
          <div className="relative">
            <input
              id="nickname"
              type="text"
              className={cn(
                'w-full min-h-[52px] px-4 pr-12 border-2 rounded-xl text-body font-medium text-foreground bg-card outline-none transition-all placeholder:text-muted-foreground placeholder:font-normal',
                nicknameStatus === 'valid'
                  ? 'border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/10'
                  : nicknameStatus === 'error'
                    ? 'border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/10'
                    : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/10',
              )}
              placeholder="예: 행복한바리스타"
              value={nickname}
              onChange={(e) => handleNicknameChange(e.target.value)}
              maxLength={10}
              autoFocus
              autoComplete="off"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xl pointer-events-none">
              {nicknameStatus === 'valid' && '✅'}
              {nicknameStatus === 'error' && '❌'}
              {nicknameStatus === 'checking' && '⏳'}
            </span>
          </div>
          <div className="text-right text-caption text-muted-foreground mt-1">{nickname.length}/10</div>

          {nicknameStatus === 'valid' && (
            <div className="flex items-center gap-1.5 mt-2 text-caption text-green-500 font-medium min-h-6">
              ✓ 사용 가능한 닉네임이에요
            </div>
          )}
          {nicknameStatus === 'error' && nicknameError && (
            <div className="flex items-center gap-1.5 mt-2 text-caption text-destructive font-medium min-h-6">
              ✗ {nicknameError}
            </div>
          )}
          {nicknameStatus === 'checking' && (
            <div className="flex items-center gap-1.5 mt-2 text-caption text-muted-foreground min-h-6">
              중복 확인 중...
            </div>
          )}
        </div>

        {/* 규칙 안내 */}
        <div className="bg-background rounded-xl p-4 mb-8">
          <p className="text-caption font-bold text-muted-foreground mb-2">닉네임 규칙</p>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            <li className={cn('text-caption flex items-center gap-1.5', lengthOk ? 'text-green-500' : 'text-muted-foreground')}>
              {lengthOk ? '✓' : '·'} 2~10자
            </li>
            <li className={cn('text-caption flex items-center gap-1.5', charOk ? 'text-green-500' : 'text-muted-foreground')}>
              {charOk ? '✓' : '·'} 한글, 영문, 숫자만 (띄어쓰기 불가)
            </li>
            <li className={cn('text-caption flex items-center gap-1.5', noBanned ? 'text-green-500' : 'text-muted-foreground')}>
              {noBanned ? '✓' : '·'} 금지어 미포함
            </li>
          </ul>
        </div>

        <div className="mt-auto pt-6 flex flex-col gap-2">
          <Button disabled={nicknameStatus !== 'valid'} onClick={handleStep1Next}>
            다음
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 2: 약관 동의 ──
  if (step === 2) {
    return (
      <div className="w-full max-w-[480px] bg-card rounded-2xl p-8 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col">
        {renderProgress()}

        <div className="mb-8 text-center">
          <span className="text-5xl mb-4 block">📋</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">약관 동의</h1>
          <p className="text-body text-muted-foreground leading-relaxed">
            서비스 이용을 위해 약관에 동의해 주세요
          </p>
        </div>

        {submitError && (
          <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-body font-medium">
            {submitError}
          </div>
        )}

        <div className="mb-8">
          {/* 전체 동의 */}
          <div
            className={cn(
              'flex items-center gap-2 min-h-[52px] p-4 rounded-xl mb-4 cursor-pointer border-2 transition-all',
              allChecked
                ? 'border-primary bg-primary/5'
                : 'border-border bg-background hover:border-primary',
            )}
            onClick={toggleAll}
            role="checkbox"
            aria-checked={allChecked}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAll() } }}
          >
            <span
              className={cn(
                'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all text-sm',
                allChecked ? 'bg-primary border-primary text-white' : 'bg-card border-border text-transparent',
              )}
            >
              ✓
            </span>
            <span className="text-body font-bold text-foreground flex-1">전체 동의</span>
          </div>

          {/* 개별 약관 */}
          <div className="flex flex-col gap-1">
            {TERMS.map((term) => (
              <div key={term.id} className="flex items-center gap-2 min-h-[52px] px-4 py-2 cursor-pointer rounded-lg transition-colors hover:bg-background">
                <span
                  className={cn(
                    'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all text-sm',
                    agreed[term.id] ? 'bg-primary border-primary text-white' : 'bg-card border-border text-transparent',
                  )}
                  onClick={() => toggleTerm(term.id)}
                  role="checkbox"
                  aria-checked={agreed[term.id]}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTerm(term.id) } }}
                >
                  ✓
                </span>
                <span className="flex-1 text-caption text-foreground" onClick={() => toggleTerm(term.id)}>
                  {term.label}
                </span>
                <span className={cn('text-caption', term.required ? 'text-primary font-bold' : 'text-muted-foreground')}>
                  {term.required ? '[필수]' : '[선택]'}
                </span>
                {term.url && (
                  <a
                    href={term.url}
                    className="text-caption text-muted-foreground underline shrink-0 min-w-[52px] min-h-[52px] flex items-center justify-center hover:text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${term.label} 전문 보기`}
                  >
                    보기
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-6 flex flex-col gap-2">
          <Button disabled={!allRequired || isPending} onClick={handleSubmit}>
            {isPending ? '처리 중...' : '완료'}
          </Button>
          <Button variant="ghost" onClick={() => setStep(1)} disabled={isPending}>
            ← 이전 단계
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 3: 가입 완료 ──
  return (
    <div className="w-full max-w-[480px] bg-card rounded-2xl p-8 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col">
      <div className="text-center py-8">
        <span className="text-7xl mb-6 block animate-in zoom-in-50 duration-500">🎉</span>
        <h1 className="text-2xl font-bold text-foreground mb-2">환영합니다!</h1>
        <p className="text-body text-muted-foreground leading-relaxed mb-4">
          <strong>{nickname}</strong>님,<br />
          우나어에 오신 것을 환영해요
        </p>
        <div className="inline-flex items-center gap-2 px-6 py-2 bg-primary/5 rounded-full text-body font-bold text-primary mb-4">
          🌱 새싹 등급
        </div>
        <div className="bg-background rounded-xl p-5 text-left space-y-2 mb-4">
          <p className="text-caption text-foreground font-medium">🌱 새싹 등급으로 시작해요!</p>
          <p className="text-caption text-muted-foreground leading-relaxed">
            글쓰기와 댓글 작성이 가능합니다.<br />
            활동하면 등급이 올라가고, 이미지 첨부 등 더 많은 기능을 쓸 수 있어요.
          </p>
          <div className="text-caption text-muted-foreground pt-1">
            <span className="text-primary font-bold">다음 등급 🌿 단골</span> → 게시글 5개 또는 댓글 20개
          </div>
        </div>
      </div>

      <div className="mt-auto pt-6 flex flex-col gap-3">
        <Button disabled={isNavigating} onClick={handleComplete}>
          {isNavigating ? '이동 중...' : '우나어 시작하기'}
        </Button>
      </div>
    </div>
  )
}
