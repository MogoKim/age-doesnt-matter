/**
 * 봇 write 입구 게이트 (Rescue R4, 2026-09-05)
 *
 * /api/bot/posts · /api/bot/jobs 처럼 외부 봇이 글을 "쓰는" 라우트는 기본 차단한다.
 * 인증(authenticateBot)은 그대로 두어 키 유효성 확인(/api/bot/check)과 로그 적재(/api/bot/logs)는 계속 동작한다.
 *
 * 켜는 방법: 환경변수 BOT_WRITE_ENABLED='true' (정확히 이 문자열만). 미설정·다른 값은 전부 차단.
 * 이 값은 R7(콘텐츠 파이프라인 재설계)에서 유일한 입구로 승격할 때만 켠다.
 */

export const BOT_WRITE_BLOCKED_MESSAGE = 'bot write disabled (Rescue R4 — BOT_WRITE_ENABLED is not true)'

export function isBotWriteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BOT_WRITE_ENABLED === 'true'
}

/** 차단 시 서버 로그 1줄 — 외부 호출자 파악용(값·본문은 남기지 않는다) */
export function logBotWriteBlocked(route: string, botType: string | undefined): void {
  console.warn(`[bot-write-gate] blocked route=${route} botType=${botType ?? 'unknown'}`)
}
