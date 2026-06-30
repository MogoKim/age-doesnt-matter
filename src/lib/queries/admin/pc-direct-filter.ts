// 트래픽 품질 필터(B룰) — PC 직접 단일조회·무활동 세션을 운영 KPI 집계에서만 제외(가역).
// ⚠️ '봇 확정'이 아니다. 실제 사람이 1페이지만 보고 나간 케이스가 포함될 수 있는 저품질/무활동 세션이므로
//    EventLog.isBot은 절대 건드리지 않고(영구 마킹 X), 집계 단계에서만 제외해 언제든 되돌릴 수 있게 한다.
// A룰(확정 크롤러 봇, BOT_UA_PATTERN·PR #28)은 ingestion에서 isBot=true 처리 — 본 필터(B)와 성격이 다르다.
//   - A = 이름표가 분명한 확정 크롤러 봇 (영구 차단)
//   - B = PC 직접 단일조회·무활동 세션 (KPI 품질 필터, 가역)
// 동일 기준을 DailyKpiSnapshot 수집(agents) · /admin 오늘 실시간 · getInsights 채널표에 적용.
// (agents/scripts는 src 런타임 import 금지 → 같은 상수/판정을 그쪽에 복제. 변경 시 동기화.)

/** 세션에 하나라도 있으면 '사람 활동'으로 보고 품질 필터에서 제외 면제 */
export const ACTIVITY_EVENTS = [
  'login',
  'sign_up',
  'signup_step',
  'post_cta_clicked',
  'comment',
  'comment_created',
  'signup_banner_clicked',
] as const

export const TRAFFIC_QUALITY_FILTER_VERSION = 'traffic-quality-v1'
export const TRAFFIC_QUALITY_FILTER_FROM = '2026-06-30' // B 품질 필터 적용 시작일(단차 기준)

export interface DirectSession {
  browserEnv: string
  firstReferrer: string
  pv: number
  hasUserId: boolean
  hasActivity: boolean
}

/**
 * B룰: PC 직접(desktop) · 첫 referrer 없음 · page_view 1 · userId 없음 · 활동 이벤트 없음
 * → 단일조회·무활동 세션으로 보고 운영 KPI 집계에서 제외(봇 확정 아님 — 저품질 트래픽 필터).
 */
export function isLowQualityDirectSession(s: DirectSession): boolean {
  return s.browserEnv === 'desktop' && s.firstReferrer === '' && s.pv === 1 && !s.hasUserId && !s.hasActivity
}
