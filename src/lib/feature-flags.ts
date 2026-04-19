/**
 * Feature Flags — 롤백 보험
 * Vercel 환경변수로 재배포 없이 즉시 off 가능
 * 기본값: true (환경변수 미설정 시 활성)
 */
export const flags = {
  webPush: process.env.FEATURE_WEB_PUSH !== 'false',
  pushToast: process.env.FEATURE_PUSH_TOAST !== 'false',
  twa: process.env.FEATURE_TWA !== 'false',
} as const
