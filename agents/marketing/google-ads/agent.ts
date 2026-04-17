/**
 * Google Ads 에이전트
 *
 * 역할: 구글 애즈 성과 조회 + Slack #리포트 알림
 * 모델: light (Haiku) — 데이터 집계, 수치 판단
 * 실행: runner.ts 'cmo:google-ads-report' 핸들러 경유
 *
 * DB write 없음 (CMO는 canWrite: false)
 */

import { BaseAgent } from '../../core/agent.js'
import type { AgentResult } from '../../core/types.js'

class GoogleAdsAgent extends BaseAgent {
  constructor() {
    super({
      name: 'GoogleAds',
      botType: 'CMO',
      role: 'CMO (구글 애즈 성과 분석)',
      model: 'light',
      tasks: '구글 애즈 성과 조회, 캠페인 이상 감지, Slack 리포트 전송',
      canWrite: false,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    try {
      // daily-report.ts 스크립트 실행 (동적 임포트로 진입점 트리거)
      await import('./scripts/daily-report.js')
      return {
        agent: 'GoogleAdsAgent',
        success: true,
        summary: 'Google Ads 일일 성과 리포트 완료 → Slack #리포트 전송',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        agent: 'GoogleAdsAgent',
        success: false,
        summary: 'Google Ads 리포트 실패',
        error: msg,
      }
    }
  }
}

// 직접 실행 시 (execute()는 BaseAgent의 공개 메서드)
if (import.meta.url === `file://${process.argv[1]}`) {
  new GoogleAdsAgent().execute().catch(console.error)
}
