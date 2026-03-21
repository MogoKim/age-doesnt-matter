/**
 * 환경변수 검증 — 서버 시작 시 필수 값 누락을 조기 감지
 */

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`[ENV] 필수 환경변수 누락: ${key}`)
  }
  return value
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback
}

/** DB */
export const DATABASE_URL = requireEnv('DATABASE_URL')

/** NextAuth */
export const AUTH_SECRET = requireEnv('AUTH_SECRET')
export const AUTH_KAKAO_ID = requireEnv('AUTH_KAKAO_ID')
export const AUTH_KAKAO_SECRET = requireEnv('AUTH_KAKAO_SECRET')

/** Admin JWT */
export const ADMIN_JWT_SECRET = requireEnv('ADMIN_JWT_SECRET')

/** R2 Storage */
export const R2_ACCOUNT_ID = requireEnv('R2_ACCOUNT_ID')
export const R2_ACCESS_KEY_ID = requireEnv('R2_ACCESS_KEY_ID')
export const R2_SECRET_ACCESS_KEY = requireEnv('R2_SECRET_ACCESS_KEY')
export const R2_BUCKET_NAME = requireEnv('R2_BUCKET_NAME')
export const R2_PUBLIC_URL = requireEnv('R2_PUBLIC_URL')

/** Kakao Share */
export const NEXT_PUBLIC_KAKAO_JS_KEY = optionalEnv('NEXT_PUBLIC_KAKAO_JS_KEY', '')

/** Telegram (운영 알림, optional) */
export const TELEGRAM_BOT_TOKEN = optionalEnv('TELEGRAM_BOT_TOKEN', '')
export const TELEGRAM_CHAT_ID = optionalEnv('TELEGRAM_CHAT_ID', '')

/** Bot API Keys (optional, agent 연동) */
export const BOT_API_KEY_JOB = optionalEnv('BOT_API_KEY_JOB', '')
export const BOT_API_KEY_HUMOR = optionalEnv('BOT_API_KEY_HUMOR', '')
export const BOT_API_KEY_STORY = optionalEnv('BOT_API_KEY_STORY', '')
export const BOT_API_KEY_SEED = optionalEnv('BOT_API_KEY_SEED', '')

/** App */
export const NEXT_PUBLIC_APP_URL = optionalEnv('NEXT_PUBLIC_APP_URL', 'https://age-doesnt-matter.com')
export const NODE_ENV = optionalEnv('NODE_ENV', 'development')
