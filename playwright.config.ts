import { defineConfig, devices } from '@playwright/test'
import path from 'path'

// QA 전용 storageState 경로
const ADMIN_AUTH = path.join(__dirname, 'e2e/.auth/admin.json')
const USER_AUTH = path.join(__dirname, 'e2e/.auth/user.json')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['json', { outputFile: 'playwright-report/results.json' }]],
  timeout: 60_000, // 기본 30s → 60s (광고 로딩 페이지 대응)

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: { 'x-bot-type': 'e2e-test' },
  },

  projects: [
    // ── 기존 프로젝트 ──
    {
      name: 'chromium',
      testMatch: /^(?!.*\/qa\/).*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      testMatch: /^(?!.*\/qa\/).*\.spec\.ts$/,
      use: { ...devices['Pixel 7'] },
    },

    // ── Smoke Fast 프로젝트 (CI --grep @smoke 전용) ──
    // @smoke 태그 테스트만 실행 — CI e2e-smoke job에서 사용
    {
      name: 'smoke-fast',
      testMatch: /e2e\/.*\.spec\.ts$/,
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ── QA 프로젝트 ──
    // 1. 어드민 storageState 생성 (setup)
    {
      name: 'setup-admin',
      testMatch: /fixtures\/auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // 2. 공개 페이지 QA (인증 불필요)
    {
      name: 'qa-public',
      testMatch: /qa\/(0[1-4])-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // 3. 유저 인증 QA (user.json storageState)
    {
      name: 'qa-user',
      testMatch: /qa\/05-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: USER_AUTH,
      },
    },
    // 4. 어드민 QA (admin.json storageState, setup-admin 후 실행)
    {
      name: 'qa-admin',
      testMatch: /qa\/(0[6-9]|1[0-4])-.*\.spec\.ts/,
      dependencies: ['setup-admin'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_AUTH,
      },
    },
    // 5. 에러/엣지케이스 QA
    {
      name: 'qa-edge',
      testMatch: /qa\/14-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // 6. 종합 Deep QA — 모바일 (390×844, user.json)
    {
      name: 'qa-deep-mobile',
      testMatch: /qa\/15-.*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        storageState: USER_AUTH,
      },
    },
    // 7. 종합 Deep QA — 데스크탑 (1440×900, user.json)
    {
      name: 'qa-deep-desktop',
      testMatch: /qa\/15-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: USER_AUTH,
      },
    },
    // 8. 업로드 검증 (user.json)
    {
      name: 'qa-upload',
      testMatch: /qa\/16-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: USER_AUTH,
      },
    },
    // 9. 최근 수정사항 검증 (user.json)
    {
      name: 'qa-fixes',
      testMatch: /qa\/17-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: USER_AUTH,
      },
    },

    // ── 감사(Audit) QA — 프로덕션 대상 검수 ──

    // 10. 전체 페이지 렌더링 + 성능 감사 (데스크탑)
    {
      name: 'qa-audit',
      testMatch: /qa\/(18|19|20|25)-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        screenshot: 'on',
      },
    },
    // 11. 전체 페이지 + 여정 감사 (모바일 — UX 라이팅은 데스크탑만)
    {
      name: 'qa-audit-mobile',
      testMatch: /qa\/(18|19)-.*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        screenshot: 'on',
      },
    },
    // 12. 로그인 유저 여정 감사 (user.json)
    {
      name: 'qa-audit-user',
      testMatch: /qa\/19-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
      },
    },
    // 13. 글쓰기 화면 모바일 UX 검증 (Pixel 7, user.json, 프로덕션)
    {
      name: 'qa-write-mobile',
      testMatch: /qa\/21-.*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
      },
    },

    // 14-a. 글쓰기 UX — iPhone 16 Pro (402×874, DPR3, Chromium + iOS UA)
    // WebKit 미설치 환경을 위해 Chromium으로 렌더링, 뷰포트/UA만 iOS 기준 적용
    {
      name: 'qa-write-iphone16pro',
      testMatch: /qa\/21-write-devices.*\.spec\.ts/,
      use: {
        browserName: 'chromium',
        viewport: { width: 402, height: 874 },
        deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
        hasTouch: true,
        isMobile: true,
      },
    },
    // 14-b. 글쓰기 UX — Samsung Galaxy S24 Ultra (412×915, DPR3.5, Chrome Android)
    {
      name: 'qa-write-s24ultra',
      testMatch: /qa\/21-write-devices.*\.spec\.ts/,
      use: {
        ...devices['Galaxy S24'],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 3.5,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
        hasTouch: true,
        isMobile: true,
      },
    },

    // 17. iOS Safari WebKit — iPhone 16 Pro (390×844, DPR3)
    // 진짜 WebKit 엔진 사용 — Chromium 에뮬레이션과 달리 iOS Safari 전용 버그 감지
    // 설치: npx playwright install webkit
    // 요청 언어: "iPhone으로", "iOS로", "Safari로", "WebKit으로"
    {
      name: 'qa-ios-webkit',
      testMatch: /qa\/(18|19|21-write-devices|2[6-9]).*\.spec\.ts/,
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
      },
    },

    // 18. 전체 클릭 감사 — Galaxy S24 Ultra (412×915, DPR3.5, Chromium Android)
    {
      name: 'qa-galaxy',
      testMatch: /qa\/2[6-9]-.*\.spec\.ts/,
      use: {
        ...devices['Galaxy S24'],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 3.5,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
        hasTouch: true,
        isMobile: true,
      },
    },

    // 19. 전체 클릭 감사 — Desktop Chrome 1440×900 (user.json)
    {
      name: 'qa-audit-user-full',
      testMatch: /qa\/2[6-9]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: process.env.QA_AUDIT_URL || 'https://www.age-doesnt-matter.com',
        storageState: USER_AUTH,
        screenshot: 'on',
      },
    },

    // 14. SignupPromptBanner GTM 이벤트 검증 (비로그인, 모바일, E2E_BASE_URL 권장)
    {
      name: 'signup-banner',
      testMatch: /qa\/22-signup-banner-gtm\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },

    // 15. 데이터 헬스 트래킹 QA — 비인증 (T1-T5, T8)
    {
      name: 'qa-tracking',
      testMatch: /qa\/23-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        extraHTTPHeaders: { 'x-bot-type': 'e2e-test' },
      },
    },
    // 16. 데이터 헬스 트래킹 QA — 인증 필요 (T6, user.json)
    {
      name: 'qa-tracking-user',
      testMatch: /qa\/23-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: USER_AUTH,
        extraHTTPHeaders: { 'x-bot-type': 'e2e-test' },
      },
    },
  ],

  // E2E_BASE_URL 설정 시 외부 URL 직접 테스트 (프로덕션 QA)
  // 미설정 시 로컬 서버 자동 시작
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
