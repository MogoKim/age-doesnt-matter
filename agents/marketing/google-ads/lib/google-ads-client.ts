/**
 * Google Ads API 클라이언트 래퍼
 *
 * 사전 준비 (수동):
 *   1. 구글 애즈 → 도구 및 설정 → API 센터 → 개발자 토큰 신청
 *   2. Google Cloud Console → Google Ads API 활성화 → OAuth2 클라이언트 생성
 *   3. npx tsx agents/marketing/google-ads/scripts/get-refresh-token.ts 실행으로 refresh_token 발급
 *
 * 환경변수 (.env.local + GitHub Secrets):
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN
 *   GOOGLE_ADS_CUSTOMER_ID     ← 구글 애즈 계정 ID (하이픈 없는 숫자)
 */

// google-ads-api 패키지가 설치되지 않은 경우를 위한 타입 정의
// npm install google-ads-api 실행 필요
type GoogleAdsApiClient = {
  Customer: (config: {
    customer_id: string
    refresh_token: string
    login_customer_id?: string
  }) => GoogleAdsCustomer
}

type GoogleAdsCustomer = {
  campaigns: {
    create: (campaigns: unknown[]) => Promise<{ results: Array<{ resource_name: string }> }>
  }
  adGroups: {
    create: (adGroups: unknown[]) => Promise<{ results: Array<{ resource_name: string }> }>
  }
  adGroupAds: {
    create: (ads: unknown[]) => Promise<{ results: Array<{ resource_name: string }> }>
  }
  adGroupCriteria: {
    create: (criteria: unknown[]) => Promise<{ results: Array<{ resource_name: string }> }>
  }
  campaignBudgets: {
    create: (budgets: unknown[]) => Promise<{ results: Array<{ resource_name: string }> }>
  }
  query: (gaql: string) => Promise<unknown[]>
}

// ──────────────────────────────────────────────────────────────
// 환경변수 검증
// ──────────────────────────────────────────────────────────────

export interface GoogleAdsCredentials {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  customerId: string   // 하이픈 없는 10자리 숫자 (광고 계정)
  loginCustomerId?: string  // MCC 계정 ID (선택)
}

export function getCredentials(): GoogleAdsCredentials {
  const required = {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
  }

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k)

  if (missing.length > 0) {
    throw new Error(
      `[GoogleAdsClient] 환경변수 누락: ${missing.join(', ')}\n` +
      `  .env.local에 다음 항목을 추가해주세요:\n` +
      missing.map(k => `  GOOGLE_ADS_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}=...`).join('\n')
    )
  }

  return {
    ...required as GoogleAdsCredentials,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  }
}

// ──────────────────────────────────────────────────────────────
// 클라이언트 팩토리
// ──────────────────────────────────────────────────────────────

export async function createGoogleAdsClient(): Promise<GoogleAdsCustomer> {
  const creds = getCredentials()

  // google-ads-api 패키지 동적 임포트 (설치 여부 확인)
  let GoogleAdsApi: GoogleAdsApiClient
  try {
    // @ts-expect-error — google-ads-api는 설치 후 사용 가능 (cd agents && npm install google-ads-api)
    const mod = await import('google-ads-api')
    GoogleAdsApi = new mod.GoogleAdsApi({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      developer_token: creds.developerToken,
    }) as unknown as GoogleAdsApiClient
  } catch {
    throw new Error(
      '[GoogleAdsClient] google-ads-api 패키지가 없습니다.\n' +
      '  실행: cd agents && npm install google-ads-api'
    )
  }

  return GoogleAdsApi.Customer({
    customer_id: creds.customerId,
    refresh_token: creds.refreshToken,
    ...(creds.loginCustomerId ? { login_customer_id: creds.loginCustomerId } : {}),
  })
}

// ──────────────────────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────────────────────

/** KRW → 구글 애즈 마이크로 단위 변환 (1원 = 1,000,000 micros) */
export function krwToMicros(krw: number): number {
  return krw * 1_000_000
}

/** KST 시간 → UTC 시간 변환 (KST = UTC+9) */
export function kstToUtcHour(kstHour: number): number {
  return ((kstHour - 9) + 24) % 24
}

/** 구글 애즈 리소스 이름에서 ID 추출 */
export function extractId(resourceName: string): string {
  return resourceName.split('/').pop() ?? ''
}
