/**
 * persona matcher shadow — 순수부 (모드 파싱). DB/SDK 의존 없음 — vitest 직접 로드 가능.
 * 런타임(BotLog 기록)은 persona-matcher-shadow.ts 참조.
 */
export type MatcherMode = 'off' | 'shadow'

export function resolveMatcherMode(raw: string | undefined): MatcherMode {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'shadow') return 'shadow'
  if (v === 'on') {
    console.warn('[PersonaMatcherShadow] MODE=on은 1단계 미지원(운영은 shadow만 허용) — shadow로 동작')
    return 'shadow'
  }
  return 'off' // 미설정·오타 포함 전부 off — 안전 기본값
}
