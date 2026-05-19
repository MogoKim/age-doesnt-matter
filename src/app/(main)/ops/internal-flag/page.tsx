'use client'

import { useEffect, useState } from 'react'

export default function InternalFlagPage() {
  const [status, setStatus] = useState<'loading' | 'on' | 'off'>('loading')

  useEffect(() => {
    setStatus(localStorage.getItem('unao_internal') === '1' ? 'on' : 'off')
  }, [])

  const enable = () => {
    localStorage.setItem('unao_internal', '1')
    setStatus('on')
  }

  const disable = () => {
    localStorage.removeItem('unao_internal')
    setStatus('off')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-background">
      <p className="text-sm text-muted-foreground">내부 트래픽 설정</p>

      {status === 'loading' && (
        <p className="text-muted-foreground">확인 중...</p>
      )}

      {status === 'on' && (
        <>
          <div className="text-center space-y-2">
            <p className="text-2xl">✅</p>
            <p className="font-bold text-foreground">이 브라우저는 내부 트래픽으로 설정됨</p>
            <p className="text-sm text-muted-foreground">방문 기록이 분석 지표에서 제외됩니다</p>
          </div>
          <button
            onClick={disable}
            className="px-6 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            설정 해제
          </button>
        </>
      )}

      {status === 'off' && (
        <>
          <div className="text-center space-y-2">
            <p className="text-2xl">⭕</p>
            <p className="font-bold text-foreground">아직 설정되지 않음</p>
            <p className="text-sm text-muted-foreground">아래 버튼을 누르면 이 브라우저가 내부 트래픽으로 등록됩니다</p>
          </div>
          <button
            onClick={enable}
            className="px-8 py-4 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary/90 transition-colors"
          >
            내부 트래픽으로 등록
          </button>
        </>
      )}
    </div>
  )
}
