/**
 * 약관/동의 버전 — 단일 진실의 원천.
 * ⚠️ 온보딩(src/lib/actions/onboarding.ts의 version='1.0')과 **동일 값**이어야 한다.
 * Agreement @@unique([userId, type, version]) → version이 다르면 같은 사용자에 MARKETING row가 중복 누적된다.
 */
export const MARKETING_AGREEMENT_VERSION = '1.0'
