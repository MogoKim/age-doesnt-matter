'use client'

import { useEffect } from 'react'

/**
 * 어드민 진입 시 내부 트래픽 플래그 자동 설정.
 * 창업자는 항상 /admin을 보므로, 그 브라우저에 `unao_internal=1`을 심어두면
 * 이후 공개 사이트를 로그아웃 상태로 둘러봐도 track.ts가 x-bot-type:founder로 전송 →
 * EventLog isBot=true → 대시보드 실고객 지표에서 자동 제외된다. (수동 /ops/internal-flag 불필요)
 */
export function AdminInternalFlag() {
  useEffect(() => {
    try {
      localStorage.setItem('unao_internal', '1')
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  }, [])
  return null
}
