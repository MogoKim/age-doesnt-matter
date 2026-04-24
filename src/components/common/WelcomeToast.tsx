'use client'

import { useEffect } from 'react'
import { useToast } from '@/components/common/Toast'

/**
 * 온보딩 완료 후 환영 토스트 1회 표시
 * OnboardingForm.handleComplete()에서 localStorage.setItem('signup_welcome_toast', '1') 저장 후
 * (main)/layout.tsx 마운트 시 감지 → 표시 → 즉시 키 삭제 (1회 보장)
 */
export function WelcomeToast() {
  const { toast } = useToast()

  useEffect(() => {
    const flag = localStorage.getItem('signup_welcome_toast')
    if (flag !== '1') return
    localStorage.removeItem('signup_welcome_toast')
    toast('우나어에 오신 걸 환영해요! 이제 또래들과 이야기 나눠보세요 👋', 'info')
  }, [toast])

  return null
}
