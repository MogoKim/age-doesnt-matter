'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export default function SignOutButton() {
  const [showConfirm, setShowConfirm] = useState(false)

  // 서버 주도 로그아웃: CSRF 토큰으로 네이티브 폼 POST → 서버 302 → 홈.
  // client signOut()의 fetch + window.location.href 방식이 안드로이드 WebView/TWA에서
  // 내비게이션 네이티브 에러("앗, 이런!")를 일으켜, 브라우저가 직접 처리하는
  // 폼 제출 내비게이션으로 교체(단일 네비게이션, 서버 주도).
  async function handleSignOut() {
    try {
      const res = await fetch('/api/auth/csrf', { cache: 'no-store' })
      const { csrfToken } = (await res.json()) as { csrfToken: string }

      const form = document.createElement('form')
      form.method = 'POST'
      form.action = '/api/auth/signout'

      const addField = (name: string, value: string) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        form.appendChild(input)
      }
      addField('csrfToken', csrfToken)
      // 로그아웃 후 광고 많은 홈(/) 대신 가벼운 /login으로 이동.
      // 저사양 안드로이드 크롬에서 홈 광고 과다로 렌더러 OOM 크래시가 발생해,
      // 로그아웃 목적지를 광고 없는 페이지로 두어 회피.
      addField('callbackUrl', '/login')

      document.body.appendChild(form)
      form.submit()
    } catch {
      // CSRF 조회 실패 등 예외 시 최소한 로그인 페이지로 이동
      window.location.href = '/login'
    }
  }

  return (
    <>
      <button
        className="flex items-center gap-3 w-full min-h-[56px] px-6 py-4 text-body font-medium text-muted-foreground bg-transparent border-none cursor-pointer transition-colors hover:bg-primary/5 hover:text-foreground text-left"
        onClick={() => setShowConfirm(true)}
      >
        <span className="text-lg">🚪</span>
        <span className="flex-1">로그아웃</span>
      </button>
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSignOut}
        title="로그아웃할까요?"
        message="다시 이용하려면 카카오로 로그인해야 합니다."
        cancelLabel="머무르기"
        confirmLabel="로그아웃"
      />
    </>
  )
}
