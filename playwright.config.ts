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
