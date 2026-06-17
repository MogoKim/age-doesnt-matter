'use client'

import { useState, useEffect } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { submitGreeting } from '@/lib/actions/greeting'
import { cn } from '@/lib/utils'

const LS_PREFIX = 'greeting_done_v1' // 실제 키는 `${LS_PREFIX}:${userId}` (사용자별 격리 — 공유 기기 오염 방지)
const WINDOW_MS = 72 * 60 * 60 * 1000 // 가입 72시간 이내만 노출
const MIN_LEN = 5
const MAX_LEN = 200

/**
 * 홈 최상단 "첫 인사" 위젯 (Phase 2, client island).
 * 노출: 로그인 회원 + 가입 72h 이내 + session.user.firstGreetingAt 없음 + (userId별)localStorage 완료 플래그 없음.
 * 작성 성공 시: STORY/가입인사/source=USER 글 생성(서버 액션) → local state 즉시 숨김 + userId scoped localStorage 플래그.
 * 홈 server auth() / eligibility API 없이 useAppSession()만으로 판별(홈 SSR 캐시 유지).
 *
 * localStorage 키는 반드시 userId로 스코프 — 공유 기기에서 A의 완료 플래그가 B를 숨기지 않도록.
 */
export default function FirstGreetingWidget() {
  const { data: session, status } = useAppSession()
  const userId = status === 'authenticated' ? session?.user?.id : undefined

  // lsState는 "어떤 userId의 플래그를 읽었는지(uid)"를 함께 들고 있어 유저 전환 시 stale 방지
  const [lsState, setLsState] = useState<{ uid: string; done: boolean } | null>(null)
  const [done, setDone] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // userId가 확보된 뒤에만, 해당 userId scoped 키를 읽는다.
  // 유저 전환(userId 변경) 시 재실행 → 이전 유저의 local done 리셋 + 새 userId 플래그로 갱신.
  useEffect(() => {
    if (!userId) {
      setLsState(null)
      return
    }
    setDone(false)
    let flag = false
    try {
      flag = localStorage.getItem(`${LS_PREFIX}:${userId}`) === '1'
    } catch {
      // localStorage 접근 불가 — 플래그 없음으로 간주
    }
    setLsState({ uid: userId, done: flag })
  }, [userId])

  // 비로그인/로딩/플래그 미확정/완료/이미작성/온보딩미완료/72h초과 → 미노출
  if (!userId || !session?.user) return null
  if (lsState?.uid !== userId) return null // 현재 userId의 localStorage를 아직 안 읽음(또는 유저 전환 직후)
  if (done || lsState.done) return null
  if (session.user.firstGreetingAt) return null
  if (session.user.nickname?.startsWith('user_')) return null
  const createdMs = session.user.createdAt ? new Date(session.user.createdAt).getTime() : 0
  if (!createdMs || Date.now() - createdMs > WINDOW_MS) return null

  async function handleSubmit() {
    if (submitting) return
    const msg = text.trim()
    if (msg.length < MIN_LEN) {
      setError(`인사말을 ${MIN_LEN}자 이상 입력해 주세요`)
      return
    }
    setError(null)
    setSubmitting(true)
    const res = await submitGreeting(msg)
    setSubmitting(false)
    if (res.error) {
      setError(res.error)
      return
    }
    try {
      if (userId) localStorage.setItem(`${LS_PREFIX}:${userId}`, '1')
    } catch {
      // 무시 — local state(done)로도 숨김 처리됨
    }
    setDone(true)
  }

  return (
    <section
      className="mx-4 my-4 rounded-2xl border border-primary/30 bg-primary/5 p-5"
      aria-label="첫 인사 남기기"
    >
      <h2 className="text-[18px] font-bold text-primary-text">
        👋 처음 오셨군요! 첫 인사를 남겨보세요
      </h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        이웃들이 따뜻하게 맞아드릴 거예요. 한 줄이면 충분해요.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_LEN}
        rows={2}
        placeholder="예) 안녕하세요, 잘 부탁드려요!"
        className="mt-3 w-full resize-none rounded-xl border border-border bg-background p-3 text-[18px] leading-relaxed outline-none focus:border-primary"
        disabled={submitting}
      />

      {error && <p className="mt-2 text-[15px] text-primary-text">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || text.trim().length < MIN_LEN}
        className={cn(
          'mt-3 h-[52px] w-full rounded-xl bg-primary text-[18px] font-bold text-white transition-opacity',
          (submitting || text.trim().length < MIN_LEN) && 'opacity-50',
        )}
      >
        {submitting ? '등록 중…' : '첫 인사 남기기'}
      </button>
    </section>
  )
}
