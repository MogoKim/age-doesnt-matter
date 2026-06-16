'use client'

import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { checkNickname, completeOnboarding } from '@/lib/actions/onboarding'
import { gtmSignUp, sendGtmEvent, waitForGtagReady, getBrowserEnv } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { setPushToastTrigger } from '@/components/common/PushPermissionToast'
// 닉네임 규칙은 단일 진실(@/lib/nickname) — 가입/프로필변경 공통. 화면별 규칙 drift 방지
import { validateNicknameFormat as validateNickname, NICKNAME_REGEX, BANNED_WORDS, NICKNAME_MIN, NICKNAME_MAX } from '@/lib/nickname'

type NicknameStatus = 'idle' | 'checking' | 'valid' | 'error'

// ── 약관 항목 ──
interface TermItem {
  id: string
  label: string
  required: boolean
  url?: string
}

const TERMS: TermItem[] = [
  { id: 'service', label: '이용약관 동의', required: true, url: '/terms' },
  { id: 'privacy', label: '개인정보처리방침 동의', required: true, url: '/privacy' },
  { id: 'marketing', label: '마케팅 수신 동의', required: false },
]

// 진행 상태 영속화 키 — middleware가 온보딩 미완 유저를 /onboarding으로 강제 리다이렉트(:181)할 때
// 페이지가 통째로 새로 로드돼 useState가 초기화되는 것을 방지(직전 단계로 복원).
const PROGRESS_KEY = 'unao_onboarding_progress'

// ── 메인 컴포넌트 ──
export default function OnboardingForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState('')
  const [isNavigating, setIsNavigating] = useState(false)
  const [hydrated, setHydrated] = useState(false) // sessionStorage 복원 완료 플래그(저장 effect 가드)

  // Step 1 - 닉네임
  const [nickname, setNickname] = useState('')
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>('idle')
  const [nicknameError, setNicknameError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepRef = useRef<1 | 2 | 3>(1)

  // Step 2 - 약관
  const [agreed, setAgreed] = useState<Record<string, boolean>>({
    service: false,
    privacy: false,
    marketing: false,
  })

  const lengthOk = nickname.length >= NICKNAME_MIN && nickname.length <= NICKNAME_MAX
  const charOk = nickname.length === 0 || NICKNAME_REGEX.test(nickname)
  const noBanned = !BANNED_WORDS.some((w) => nickname.toLowerCase().includes(w))

  const checkDuplicateFromServer = useCallback(async (value: string) => {
    setNicknameStatus('checking')
    try {
      // 8초 내 응답 없으면 타임아웃 — ⏳('중복 확인 중...') 무한 정체 방지 (모바일 네트워크 끊김 등)
      const result = await Promise.race([
        checkNickname(value),
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
      // 네트워크/서버 오류·타임아웃 — 멈추지 말고 재시도 안내 (재입력 시 handleNicknameChange가 재검증)
      setNicknameStatus('error')
      setNicknameError('확인이 지연돼요. 잠시 후 다시 시도해 주세요')
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

    debounceRef.current = setTimeout(() => checkDuplicateFromServer(value), 250)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // 가입 퍼널 추적 — Step 1 진입 (컴포넌트 첫 마운트 시)
  useEffect(() => {
    sendGtmEvent('signup_step', { step: 1, step_name: 'nickname', browser_env: getBrowserEnv() })
    trackEvent('signup_step', { step: 1, step_name: 'nickname', browser_env: getBrowserEnv() })
  }, [])

  // 가입 퍼널 추적 — Step 2 진입
  useEffect(() => {
    if (step === 2) {
      sendGtmEvent('signup_step', { step: 2, step_name: 'terms', browser_env: getBrowserEnv() })
      trackEvent('signup_step', { step: 2, step_name: 'terms', browser_env: getBrowserEnv() })
    }
  }, [step])

  // stepRef 동기화 (이탈 핸들러 클로저 스테일 방지)
  useEffect(() => { stepRef.current = step }, [step])

  // 진행 상태 복원 (마운트 1회) — 재마운트/강제 리다이렉트로 페이지가 새로 떠도 직전 단계 유지
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PROGRESS_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { step?: number; nickname?: string; agreed?: Record<string, boolean> }
        if (saved.nickname) setNickname(saved.nickname)
        if (saved.agreed) setAgreed((prev) => ({ ...prev, ...saved.agreed }))
        if (saved.step === 2) setStep(2) // step3(완료)는 복원하지 않음 — 재진입 시 폼 처음부터
        // 복원된 닉네임 재검증 (그새 다른 사람이 선점했을 수 있음 + step1 '다음' 버튼 활성화 위해 status 복구)
        if (saved.nickname && !validateNickname(saved.nickname)) {
          checkDuplicateFromServer(saved.nickname)
        }
      }
    } catch { /* sessionStorage 불가 환경 무시 */ }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 진행 상태 저장 (복원 완료 후에만 — 초기 default가 저장본을 덮어쓰는 것 방지)
  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ step, nickname, agreed }))
    } catch { /* 무시 */ }
  }, [hydrated, step, nickname, agreed])

  // 가입 이탈 감지 — 어느 단계에서 이탈했는지 기록.
  // beforeunload는 모바일(iOS/TWA)에서 자주 미발화 → visibilitychange(hidden)+pagehide로 신뢰화
  // (PostViewBeacon.tsx와 동일 패턴). trackEvent는 이미 sendBeacon 사용(track.ts).
  useEffect(() => {
    const startTime = Date.now()
    let fired = false
    const fire = () => {
      if (fired) return
      if (localStorage.getItem('signup_completed_at')) return
      fired = true
      const payload = {
        abandoned_at_step: stepRef.current,
        time_spent_ms: Date.now() - startTime,
        browser_env: getBrowserEnv(),
      }
      sendGtmEvent('signup_abandoned', payload)
      trackEvent('signup_abandoned', payload)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') fire() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', fire)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', fire)
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
        sendGtmEvent('signup_step', { step: 3, step_name: 'welcome', browser_env: getBrowserEnv() })
        trackEvent('signup_step', { step: 3, step_name: 'welcome', browser_env: getBrowserEnv() })
        setStep(3)
      }
    })
  }

  async function handleComplete() {
    setIsNavigating(true)
    // 가입 완료 — 진행 상태 영속 데이터 정리 (다음 가입자에게 잔여 복원 방지)
    try { sessionStorage.removeItem(PROGRESS_KEY) } catch { /* 무시 */ }
    // 인앱→외부브라우저 재접속 감지용 (sessionStorage는 탭 전환 시 유실됨)
    localStorage.setItem('signup_completed_at', new Date().toISOString())
    // 환영 토스트 1회 표시 트리거 (layout.tsx Phase 3에서 처리)
    localStorage.setItem('signup_welcome_toast', '1')
    // 가입 직후 푸시 구독 유도 — 홈((main)) 진입 시 sessionStorage 폴백으로 토스트 노출
    setPushToastTrigger('signup')
    gtmSignUp('kakao')
    trackEvent('sign_up', {
      method: 'kakao',
      browser_env: getBrowserEnv(),
    })
    // gtag.js 로드 완료 대기 — _gtagReady=true 확인 후 navigate
    // window.gtag 존재 체크는 부족 (GTM stub이 미리 생성됨)
    await waitForGtagReady()
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
    router.push(callbackUrl || '/')
    router.refresh()
  }

  // ── 프로그레스 바 (Step 1, 2만) ──
  function renderProgress() {
    return (
      <div className="flex gap-2 mb-8">
        <div
          className={cn(
            'flex-1 h-1 rounded-full transition-colors duration-300',
            step === 1 ? 'bg-primary' : 'bg-success',
          )}
        />
        <div
          className={cn(
            'flex-1 h-1 rounded-full transition-colors duration-300',
            step === 2 ? 'bg-primary' : step > 2 ? 'bg-success' : 'bg-border',
          )}
        />
      </div>
    )
  }

  // ── Step 1: 닉네임 설정 ──
  if (step === 1) {
    return (
      <div className="w-full max-w-[480px] bg-card rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex flex-col max-md:max-w-none max-md:rounded-none max-md:h-dvh max-md:shadow-none">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-8">
        {renderProgress()}

        <div className="mb-8 text-center">
          <span className="text-5xl mb-4 block">👋</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">반가워요!</h1>
          <p className="text-body text-muted-foreground leading-relaxed">
            우나어에서 사용할 닉네임을 정해 주세요
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-[17px] font-bold text-foreground mb-2" htmlFor="nickname">닉네임</label>
          <div className="relative">
            <input
              id="nickname"
              type="text"
              className={cn(
                'w-full min-h-[52px] px-4 pr-12 border-2 rounded-xl text-body font-medium text-foreground bg-card outline-none transition-colors placeholder:text-muted-foreground placeholder:font-normal',
                nicknameStatus === 'valid'
                  ? 'border-success focus:border-success focus:ring-2 focus:ring-success/10'
                  : nicknameStatus === 'error'
                    ? 'border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/10'
                    : 'border-border focus:border-primary focus:ring-2 focus:ring-primary/10',
              )}
              placeholder="예: 행복한바리스타"
              value={nickname}
              onChange={(e) => handleNicknameChange(e.target.value)}
              maxLength={NICKNAME_MAX}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xl pointer-events-none">
              {nicknameStatus === 'valid' && '✅'}
              {nicknameStatus === 'error' && '❌'}
              {nicknameStatus === 'checking' && '⏳'}
            </span>
          </div>
          <div className="text-right text-[17px] text-muted-foreground mt-1">{nickname.length}/10</div>

          {nicknameStatus === 'valid' && (
            <div className="flex items-center gap-1.5 mt-2 text-[17px] text-success font-medium min-h-6">
              ✓ 사용 가능한 닉네임이에요
            </div>
          )}
          {nicknameStatus === 'error' && nicknameError && (
            <div className="flex items-center gap-1.5 mt-2 text-[17px] text-destructive font-medium min-h-6">
              ✗ {nicknameError}
            </div>
          )}
          {nicknameStatus === 'checking' && (
            <div className="flex items-center gap-1.5 mt-2 text-[17px] text-muted-foreground min-h-6">
              중복 확인 중...
            </div>
          )}
        </div>

        {/* 규칙 안내 */}
        <div className="bg-background rounded-xl p-4 mb-8">
          <p className="text-[17px] font-bold text-muted-foreground mb-2">닉네임 규칙</p>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            <li className={cn('text-[17px] flex items-center gap-1.5', lengthOk ? 'text-success' : 'text-muted-foreground')}>
              {lengthOk ? '✓' : '·'} {NICKNAME_MIN}~{NICKNAME_MAX}자
            </li>
            <li className={cn('text-[17px] flex items-center gap-1.5', charOk ? 'text-success' : 'text-muted-foreground')}>
              {charOk ? '✓' : '·'} 한글, 영문, 숫자만 (띄어쓰기 불가)
            </li>
            <li className={cn('text-[17px] flex items-center gap-1.5', noBanned ? 'text-success' : 'text-muted-foreground')}>
              {noBanned ? '✓' : '·'} 금지어 미포함
            </li>
          </ul>
        </div>

        </div>
        <div className="shrink-0 flex flex-col gap-2 border-t border-border px-6 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
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
      <div className="w-full max-w-[480px] bg-card rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex flex-col max-md:max-w-none max-md:rounded-none max-md:h-dvh max-md:shadow-none">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-8">
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
              'flex items-center gap-2 min-h-[52px] p-4 rounded-xl mb-4 cursor-pointer border-2 transition-colors',
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
                'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors text-sm',
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
                    'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors text-sm',
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
                <span className="flex-1 text-[17px] text-foreground" onClick={() => toggleTerm(term.id)}>
                  {term.label}
                </span>
                <span className={cn('text-[17px]', term.required ? 'text-primary-text font-bold' : 'text-muted-foreground')}>
                  {term.required ? '[필수]' : '[선택]'}
                </span>
                {term.url && (
                  <a
                    href={term.url}
                    className="text-[17px] text-muted-foreground underline shrink-0 min-w-[52px] min-h-[52px] flex items-center justify-center hover:text-primary-text"
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

        </div>
        <div className="shrink-0 flex flex-col gap-2 border-t border-border px-6 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
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
    <div className="w-full max-w-[480px] bg-card rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex flex-col max-md:max-w-none max-md:rounded-none max-md:h-dvh max-md:shadow-none">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-8">
      <div className="text-center py-8">
        <span className="text-7xl mb-6 block animate-in zoom-in-50 duration-500">🎉</span>
        <h1 className="text-2xl font-bold text-foreground mb-2">환영합니다!</h1>
        <p className="text-body text-muted-foreground leading-relaxed mb-4">
          <strong>{nickname}</strong>님,<br />
          우나어에 오신 것을 환영해요
        </p>
        <div className="inline-flex items-center gap-2 px-6 py-2 bg-primary/5 rounded-full text-body font-bold text-primary-text mb-4">
          🌱 새싹 등급
        </div>
        <div className="bg-background rounded-xl p-5 text-left space-y-2 mb-4">
          <p className="text-[17px] text-foreground font-medium">🌱 새싹 등급으로 시작해요!</p>
          <p className="text-[17px] text-muted-foreground leading-relaxed">
            글쓰기와 댓글 작성이 가능합니다.<br />
            활동하면 등급이 올라가고, 이미지 첨부 등 더 많은 기능을 쓸 수 있어요.
          </p>
          <div className="text-[17px] text-muted-foreground pt-1">
            <span className="text-primary-text font-bold">다음 등급 🌿 단골</span> → 게시글 5개 또는 댓글 20개
          </div>
        </div>
      </div>

      </div>
      <div className="shrink-0 flex flex-col gap-3 border-t border-border px-6 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <Button disabled={isNavigating} onClick={handleComplete}>
          {isNavigating ? '이동 중...' : '우나어 시작하기'}
        </Button>
      </div>
    </div>
  )
}
