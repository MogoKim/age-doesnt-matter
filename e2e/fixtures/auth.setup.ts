/**
 * 어드민 storageState 자동 생성 (setup-admin 프로젝트)
 * QA 어드민 spec 실행 전 1회 자동 실행됨
 *
 * 필요 환경변수:
 *   E2E_ADMIN_EMAIL    — 어드민 계정 이메일
 *   E2E_ADMIN_PASSWORD — 어드민 계정 비밀번호
 *   E2E_BASE_URL       — 테스트 대상 URL (기본: http://localhost:3000)
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'

const ADMIN_AUTH = path.join(__dirname, '../.auth/admin.json')

setup('어드민 로그인 storageState 저장', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL
  const password = process.env.E2E_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD 환경변수를 설정하세요.')
  }

  await page.goto('/admin/login')
  await expect(page.locator('input[name="email"], input#email')).toBeVisible({ timeout: 10000 })

  await page.locator('input[name="email"], input#email').fill(email)
  await page.locator('input[name="password"], input#password').fill(password)
  await page.getByRole('button', { name: /로그인/ }).click()

  // 대시보드 진입 확인
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 })
  expect(page.url()).toMatch(/\/admin/)

  // storageState 저장 (쿠키 + localStorage 포함)
  await page.context().storageState({ path: ADMIN_AUTH })
  console.log(`[setup-admin] ✅ admin.json 저장: ${ADMIN_AUTH}`)
})
