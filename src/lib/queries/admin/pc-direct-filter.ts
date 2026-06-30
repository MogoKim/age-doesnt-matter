// PC 직접 봇(B룰) 집계 필터 — EventLog.isBot은 건드리지 않고 KPI 집계에서만 제외(가역).
// A룰(공유 크롤러 UA)은 ingestion(BOT_UA_PATTERN, PR #28)에서 처리. B는 행동 휴리스틱이라 집계 단계로만.
// 동일 기준을 DailyKpiSnapshot 수집(agents) · /admin 오늘 실시간 · getInsights 채널표에 적용.
// (agents/scripts는 src 런타임 import 금지 → 같은 상수/판정을 그쪽에 복제. 변경 시 동기화.)

/** 세션에 하나라도 있으면 '사람 활동'으로 보고 B 제외 면제 */
export const ACTIVITY_EVENTS = [
  'login',
  'sign_up',
  'signup_step',
  'post_cta_clicked',
  'comment',
  'comment_created',
  'signup_banner_clicked',
] as const

export const BOT_FILTER_VERSION = 'a-ua+b-heuristic-v1'
export const PC_DIRECT_FILTER_FROM = '2026-06-30' // B 집계 필터 적용 시작일(단차 기준)

export interface PcDirectSession {
  browserEnv: string
  firstReferrer: string
  pv: number
  hasUserId: boolean
  hasActivity: boolean
}

/** B룰: desktop · 첫 referrer 없음 · page_view 1 · userId 없음 · 활동 이벤트 없음 → PC 직접 봇으로 간주 */
export function isPcDirectBotSession(s: PcDirectSession): boolean {
  return s.browserEnv === 'desktop' && s.firstReferrer === '' && s.pv === 1 && !s.hasUserId && !s.hasActivity
}
