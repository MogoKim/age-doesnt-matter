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
export const NEXTAUTH_SECRET = requireEnv('AUTH_SECRET')
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

/** Google Analytics / GTM (NEXT_PUBLIC_ — 클라이언트에서 직접 접근) */
export const NEXT_PUBLIC_GTM_ID = optionalEnv('NEXT_PUBLIC_GTM_ID', '')
export const NEXT_PUBLIC_GA4_ID = optionalEnv('NEXT_PUBLIC_GA4_ID', '')

/** Google Service Account — GA4 Data API + Search Console API (CDO 에이전트용) */
export const GOOGLE_SERVICE_ACCOUNT_JSON = optionalEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '')
export const GA4_PROPERTY_ID = optionalEnv('GA4_PROPERTY_ID', '')
export const SEARCH_CONSOLE_SITE_URL = optionalEnv('SEARCH_CONSOLE_SITE_URL', 'https://age-doesnt-matter.com')

/** AI API (agents/ 에서 사용 — optional, 없으면 해당 에이전트만 비활성화) */
export const ANTHROPIC_API_KEY = optionalEnv('ANTHROPIC_API_KEY', '')
export const CLAUDE_MODEL_STRATEGIC = optionalEnv('CLAUDE_MODEL_STRATEGIC', 'claude-opus-4-6')
export const CLAUDE_MODEL_HEAVY = optionalEnv('CLAUDE_MODEL_HEAVY', 'claude-sonnet-4-6')
export const CLAUDE_MODEL_LIGHT = optionalEnv('CLAUDE_MODEL_LIGHT', 'claude-haiku-4-5')
export const OPENAI_API_KEY = optionalEnv('OPENAI_API_KEY', '')
export const GEMINI_API_KEY = optionalEnv('GEMINI_API_KEY', '')

/** Cloudflare Turnstile (봇 차단 — 미설정 시 테스트 키 폴백으로 봇 통과됨, 반드시 Production 설정 필요) */
export const NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY = optionalEnv('NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY', '')
export const CF_TURNSTILE_SECRET_KEY = optionalEnv('CF_TURNSTILE_SECRET_KEY', '')

/** Web Push / VAPID (푸시 알림 — 미설정 시 pushsubscriptionchange 갱신 실패) */
export const NEXT_PUBLIC_VAPID_PUBLIC_KEY = optionalEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
export const VAPID_PRIVATE_KEY = optionalEnv('VAPID_PRIVATE_KEY', '')
export const VAPID_SUBJECT = optionalEnv('VAPID_SUBJECT', '')

/** Upstash Redis (Rate Limit — 미설정 시 in-memory 폴백으로 서버리스 환경에서 무효) */
export const UPSTASH_REDIS_REST_URL = optionalEnv('UPSTASH_REDIS_REST_URL', '')
export const UPSTASH_REDIS_REST_TOKEN = optionalEnv('UPSTASH_REDIS_REST_TOKEN', '')

/** Email */
export const RESEND_API_KEY = optionalEnv('RESEND_API_KEY', '')
export const CONTACT_EMAIL = optionalEnv('CONTACT_EMAIL', 'korea.age.not.matter@gmail.com')

/** Guest Like */
export const GUEST_LIKE_SALT = optionalEnv('GUEST_LIKE_SALT', '')

/** Slack Admin */
export const SLACK_ADMIN_USER_IDS = optionalEnv('SLACK_ADMIN_USER_IDS', '')

/** App */
export const NEXT_PUBLIC_APP_URL = optionalEnv('NEXT_PUBLIC_APP_URL', 'https://age-doesnt-matter.com')
export const NODE_ENV = optionalEnv('NODE_ENV', 'development')
