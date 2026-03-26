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
export const NEXTAUTH_SECRET = requireEnv('NEXTAUTH_SECRET')
export const KAKAO_CLIENT_ID = requireEnv('KAKAO_CLIENT_ID')
export const KAKAO_CLIENT_SECRET = requireEnv('KAKAO_CLIENT_SECRET')

/** Admin JWT */
export const ADMIN_JWT_SECRET = requireEnv('ADMIN_JWT_SECRET')

/** R2 Storage */
export const CLOUDFLARE_ACCOUNT_ID = requireEnv('CLOUDFLARE_ACCOUNT_ID')
export const CLOUDFLARE_R2_ACCESS_KEY = requireEnv('CLOUDFLARE_R2_ACCESS_KEY')
export const CLOUDFLARE_R2_SECRET_KEY = requireEnv('CLOUDFLARE_R2_SECRET_KEY')
export const CLOUDFLARE_R2_BUCKET = requireEnv('CLOUDFLARE_R2_BUCKET')
export const NEXT_PUBLIC_R2_PUBLIC_URL = requireEnv('NEXT_PUBLIC_R2_PUBLIC_URL')

/** Kakao Share */
export const NEXT_PUBLIC_KAKAO_JS_KEY = optionalEnv('NEXT_PUBLIC_KAKAO_JS_KEY', '')

/** Slack (운영 채널, optional) */
export const SLACK_BOT_TOKEN = optionalEnv('SLACK_BOT_TOKEN', '')
export const SLACK_SIGNING_SECRET = optionalEnv('SLACK_SIGNING_SECRET', '')

/** Bot API Keys (optional, agent 연동) */
export const BOT_API_KEY_JOB = optionalEnv('BOT_API_KEY_JOB', '')
export const BOT_API_KEY_HUMOR = optionalEnv('BOT_API_KEY_HUMOR', '')
export const BOT_API_KEY_STORY = optionalEnv('BOT_API_KEY_STORY', '')
export const BOT_API_KEY_SEED = optionalEnv('BOT_API_KEY_SEED', '')

/** Coupang Partners CPS (optional) */
export const COUPANG_ACCESS_KEY = optionalEnv('COUPANG_ACCESS_KEY', '')
export const COUPANG_SECRET_KEY = optionalEnv('COUPANG_SECRET_KEY', '')

/** X (Twitter) API (optional) */
export const X_CONSUMER_KEY = optionalEnv('X_CONSUMER_KEY', '')
export const X_CONSUMER_SECRET = optionalEnv('X_CONSUMER_SECRET', '')
export const X_ACCESS_TOKEN = optionalEnv('X_ACCESS_TOKEN', '')
export const X_ACCESS_SECRET = optionalEnv('X_ACCESS_SECRET', '')
export const X_BEARER_TOKEN = optionalEnv('X_BEARER_TOKEN', '')

/** Threads / Meta (optional) */
export const THREADS_APP_ID = optionalEnv('THREADS_APP_ID', '')
export const THREADS_APP_SECRET = optionalEnv('THREADS_APP_SECRET', '')
export const THREADS_ACCESS_TOKEN = optionalEnv('THREADS_ACCESS_TOKEN', '')

/** Google Analytics / GTM (NEXT_PUBLIC_ — 클라이언트에서 직접 접근) */
export const NEXT_PUBLIC_GTM_ID = optionalEnv('NEXT_PUBLIC_GTM_ID', '')
export const NEXT_PUBLIC_GA4_ID = optionalEnv('NEXT_PUBLIC_GA4_ID', '')

/** App */
export const NEXT_PUBLIC_APP_URL = optionalEnv('NEXT_PUBLIC_APP_URL', 'https://age-doesnt-matter.com')
export const NODE_ENV = optionalEnv('NODE_ENV', 'development')
