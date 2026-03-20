'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

// ── \uB2C9\uB124\uC784 \uC720\uD6A8\uC131 \uAC80\uC0AC ──
const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]+$/
const BANNED_WORDS = ['\uC6B4\uC601\uC790', '\uAD00\uB9AC\uC790', 'admin', '\uC5B4\uB4DC\uBBFC', '\uAD00\uB9AC\uC778']

type NicknameStatus = 'idle' | 'checking' | 'valid' | 'error'

function validateNickname(value: string): string | null {
  if (value.length < 2) return '2\uC790 \uC774\uC0C1 \uC785\uB825\uD574 \uC8FC\uC138\uC694'
  if (value.length > 10) return '10\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694'
  if (!NICKNAME_REGEX.test(value)) return '\uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694'
  const lower = value.toLowerCase()
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return '\uC0AC\uC6A9\uD560 \uC218 \uC5C6\uB294 \uB2C9\uB124\uC784\uC774\uC5D0\uC694'
  }
  return null
}

// ── \uC57D\uAD00 \uD56D\uBAA9 ──
interface TermItem {
  id: string
  label: string
  required: boolean
  url?: string
}

const TERMS: TermItem[] = [
  { id: 'service', label: '\uC774\uC6A9\uC57D\uAD00 \uB3D9\uC758', required: true, url: '/terms/service' },
  { id: 'privacy', label: '\uAC1C\uC778\uC815\uBCF4\uCC98\uB9AC\uBC29\uCE68 \uB3D9\uC758', required: true, url: '/terms/privacy' },
  { id: 'marketing', label: '\uB9C8\uCF00\uD305 \uC218\uC2E0 \uB3D9\uC758', required: false },
]

// ── \uBA54\uC778 \uCEF4\uD3EC\uB10C\uD2B8 ──
export default function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 - \uB2C9\uB124\uC784
  const [nickname, setNickname] = useState('')
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>('idle')
  const [nicknameError, setNicknameError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 2 - \uC57D\uAD00
  const [agreed, setAgreed] = useState<Record<string, boolean>>({
    service: false,
    privacy: false,
    marketing: false,
  })

  const lengthOk = nickname.length >= 2 && nickname.length <= 10
  const charOk = nickname.length === 0 || NICKNAME_REGEX.test(nickname)
  const noBanned = !BANNED_WORDS.some((w) => nickname.toLowerCase().includes(w))

  const checkDuplicate = useCallback((value: string) => {
    setNicknameStatus('checking')
    setTimeout(() => {
      const taken = ['\uD14C\uC2A4\uD2B8', '\uAD00\uB9AC\uC790', '\uC6B4\uC601\uC790']
      if (taken.includes(value)) {
        setNicknameStatus('error')
        setNicknameError('\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uB2C9\uB124\uC784\uC774\uC5D0\uC694')
      } else {
        setNicknameStatus('valid')
        setNicknameError('')
      }
    }, 500)
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

    debounceRef.current = setTimeout(() => checkDuplicate(value), 300)
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
    if (!allRequired) return
    setStep(3)
  }

  function handleComplete() {
    router.push('/')
  }

  // ── \uD504\uB85C\uADF8\uB808\uC2A4 \uBC14 ──
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
            step >= 2 ? 'bg-primary' : 'bg-border',
          )}
        />
      </div>
    )
  }

  // ── Step 1: \uB2C9\uB124\uC784 \uC124\uC815 ──
  if (step === 1) {
    return (
      <div className="w-full max-w-[480px] bg-card rounded-2xl p-8 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col">
        {renderProgress()}

        <div className="mb-8 text-center">
          <span className="text-5xl mb-4 block">\uD83D\uDC4B</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">\uBC18\uAC00\uC6CC\uC694!</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            \uC6B0\uB098\uC5B4\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uB2C9\uB124\uC784\uC744 \uC815\uD574 \uC8FC\uC138\uC694
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-bold text-foreground mb-2" htmlFor="nickname">\uB2C9\uB124\uC784</label>
          <div className="relative">
            <input
              id="nickname"
              type="text"
              className={cn(
                'w-full min-h-[52px] px-4 pr-12 border-2 rounded-xl text-sm font-medium text-foreground bg-card outline-none transition-all placeholder:text-muted-foreground placeholder:font-normal',
                nicknameStatus === 'valid'
                  ? 'border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/10'
                  : nicknameStatus === 'error'
                    ? 'border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/10'
                    : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/10',
              )}
              placeholder="\uC608: \uD589\uBCF5\uD55C\uBC14\uB9AC\uC2A4\uD0C0"
              value={nickname}
              onChange={(e) => handleNicknameChange(e.target.value)}
              maxLength={10}
              autoFocus
              autoComplete="off"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xl pointer-events-none">
              {nicknameStatus === 'valid' && '\u2705'}
              {nicknameStatus === 'error' && '\u274C'}
              {nicknameStatus === 'checking' && '\u23F3'}
            </span>
          </div>
          <div className="text-right text-xs text-muted-foreground mt-1">{nickname.length}/10</div>

          {nicknameStatus === 'valid' && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-green-500 font-medium min-h-6">
              \u2713 \uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uB2C9\uB124\uC784\uC774\uC5D0\uC694
            </div>
          )}
          {nicknameStatus === 'error' && nicknameError && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive font-medium min-h-6">
              \u2717 {nicknameError}
            </div>
          )}
          {nicknameStatus === 'checking' && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground min-h-6">
              \uC911\uBCF5 \uD655\uC778 \uC911...
            </div>
          )}
        </div>

        {/* \uADDC\uCE59 \uC548\uB0B4 */}
        <div className="bg-background rounded-xl p-4 mb-8">
          <p className="text-xs font-bold text-muted-foreground mb-2">\uB2C9\uB124\uC784 \uADDC\uCE59</p>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            <li className={cn('text-xs flex items-center gap-1.5', lengthOk ? 'text-green-500' : 'text-muted-foreground')}>
              {lengthOk ? '\u2713' : '\u00B7'} 2~10\uC790
            </li>
            <li className={cn('text-xs flex items-center gap-1.5', charOk ? 'text-green-500' : 'text-muted-foreground')}>
              {charOk ? '\u2713' : '\u00B7'} \uD55C\uAE00, \uC601\uBB38, \uC22B\uC790\uB9CC \uAC00\uB2A5
            </li>
            <li className={cn('text-xs flex items-center gap-1.5', noBanned ? 'text-green-500' : 'text-muted-foreground')}>
              {noBanned ? '\u2713' : '\u00B7'} \uAE08\uC9C0\uC5B4 \uBBF8\uD3EC\uD568
            </li>
          </ul>
        </div>

        <div className="mt-auto pt-6 flex flex-col gap-2">
          <Button disabled={nicknameStatus !== 'valid'} onClick={handleStep1Next}>
            \uB2E4\uC74C
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 2: \uC57D\uAD00 \uB3D9\uC758 ──
  if (step === 2) {
    return (
      <div className="w-full max-w-[480px] bg-card rounded-2xl p-8 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col">
        {renderProgress()}

        <div className="mb-8 text-center">
          <span className="text-5xl mb-4 block">\uD83D\uDCCB</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">\uC57D\uAD00 \uB3D9\uC758</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            \uC11C\uBE44\uC2A4 \uC774\uC6A9\uC744 \uC704\uD574 \uC57D\uAD00\uC5D0 \uB3D9\uC758\uD574 \uC8FC\uC138\uC694
          </p>
        </div>

        <div className="mb-8">
          {/* \uC804\uCCB4 \uB3D9\uC758 */}
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
              \u2713
            </span>
            <span className="text-sm font-bold text-foreground flex-1">\uC804\uCCB4 \uB3D9\uC758</span>
          </div>

          {/* \uAC1C\uBCC4 \uC57D\uAD00 */}
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
                  \u2713
                </span>
                <span className="flex-1 text-xs text-foreground" onClick={() => toggleTerm(term.id)}>
                  {term.label}
                </span>
                <span className={cn('text-xs', term.required ? 'text-primary font-bold' : 'text-muted-foreground')}>
                  {term.required ? '[\uD544\uC218]' : '[\uC120\uD0DD]'}
                </span>
                {term.url && (
                  <a
                    href={term.url}
                    className="text-xs text-muted-foreground underline shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${term.label} \uC804\uBB38 \uBCF4\uAE30`}
                  >
                    \uBCF4\uAE30
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-6 flex flex-col gap-2">
          <Button disabled={!allRequired} onClick={handleSubmit}>
            \uAC00\uC785 \uC644\uB8CC
          </Button>
          <Button variant="ghost" onClick={() => setStep(1)}>
            \u2190 \uC774\uC804 \uB2E8\uACC4
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 3: \uC644\uB8CC \uD654\uBA74 ──
  return (
    <div className="w-full max-w-[480px] bg-card rounded-2xl p-8 px-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)] max-md:max-w-none max-md:rounded-none max-md:min-h-dvh max-md:shadow-none max-md:flex max-md:flex-col">
      <div className="text-center py-8">
        <span className="text-7xl mb-6 block animate-in zoom-in-50 duration-500">\uD83C\uDF89</span>
        <h1 className="text-2xl font-bold text-foreground mb-2">\uD658\uC601\uD569\uB2C8\uB2E4!</h1>
        <p className="text-base text-muted-foreground leading-relaxed mb-4">
          <strong>{nickname}</strong>\uB2D8,<br />
          \uC6B0\uB098\uC5B4\uC5D0 \uC624\uC2E0 \uAC83\uC744 \uD658\uC601\uD574\uC694
        </p>
        <div className="inline-flex items-center gap-2 px-6 py-2 bg-primary/5 rounded-full text-sm font-bold text-primary mb-8">
          \uD83C\uDF31 \uC0C8\uC2F9 \uB4F1\uAE09
        </div>
      </div>

      <div className="mt-auto pt-6 flex flex-col gap-2">
        <Button onClick={handleComplete}>
          \uC2DC\uC791\uD558\uAE30
        </Button>
      </div>
    </div>
  )
}
