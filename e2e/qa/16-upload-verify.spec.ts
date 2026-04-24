/**
 * 업로드 직접 검증 테스트
 * 이미지/동영상 업로드 실제 동작 확인 + 에러 수집
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.age-doesnt-matter.com'
const IMAGE_FILE = path.resolve(process.cwd(), '우나어_테스트_이미지.png')
const VIDEO_FILE = path.resolve(process.cwd(), '우나어_테스트_동영상.mp4')

const consoleErrors: string[] = []
const networkErrors: { url: string; status: number; body: string }[] = []

test.describe('업로드 직접 검증', () => {
  test.use({ storageState: 'e2e/.auth/user.json' })

  test('이미지 업로드 테스트', async ({ page }) => {
    // 콘솔 에러 수집
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // 네트워크 응답 수집 (업로드 API)
    page.on('response', async res => {
      if (res.url().includes('/api/uploads')) {
        const status = res.status()
        let body = ''
        try { body = await res.text() } catch { /* ignore */ }
        networkErrors.push({ url: res.url(), status, body })
        console.log(`[NETWORK] ${res.url()} → ${status}: ${body.slice(0, 200)}`)
      }
    })

    await page.goto(`${BASE_URL}/community/write`)
    await page.waitForLoadState('networkidle')

    // 임시저장 목록이 있으면 "새로 작성하기" 클릭
    const newWriteBtn = page.locator('button', { hasText: '새로 작성하기' })
    if (await newWriteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newWriteBtn.click()
      await page.waitForTimeout(500)
    }

    // 이미지 파일 존재 확인
    expect(fs.existsSync(IMAGE_FILE)).toBe(true)

    // 📷 사진 버튼 클릭 (hidden input에 직접 파일 세팅)
    const fileInput = page.locator('input[type="file"][accept*="image"]')
    await fileInput.setInputFiles(IMAGE_FILE)

    // 업로드 완료 대기 (최대 15초)
    await page.waitForTimeout(15000)

    // 에디터에 이미지가 삽입됐는지 확인
    const editorImages = page.locator('.tiptap img')
    const imgCount = await editorImages.count()
    console.log(`[RESULT] 에디터 내 이미지 수: ${imgCount}`)

    // 에러 메시지 확인
    const errorBanner = page.locator('text=업로드에 실패했어요, text=실패')
    const errorText = await errorBanner.count() > 0 ? await errorBanner.first().textContent() : '없음'
    console.log(`[ERROR BANNER] ${errorText}`)

    console.log(`[CONSOLE ERRORS] ${JSON.stringify(consoleErrors)}`)
    console.log(`[NETWORK RESPONSES] ${JSON.stringify(networkErrors)}`)

    // 스크린샷 저장
    await page.screenshot({ path: 'e2e/screenshots/upload-image-result.png', fullPage: false })

    expect(imgCount).toBeGreaterThan(0)
  })

  test('동영상 업로드 테스트', async ({ page }) => {
    const videoNetworkLogs: { url: string; status: number; body: string }[] = []

    page.on('response', async res => {
      if (res.url().includes('/api/uploads')) {
        const status = res.status()
        let body = ''
        try { body = await res.text() } catch { /* ignore */ }
        videoNetworkLogs.push({ url: res.url(), status, body })
        console.log(`[NETWORK] ${res.url()} → ${status}: ${body.slice(0, 200)}`)
      }
    })

    await page.goto(`${BASE_URL}/community/write`)
    await page.waitForLoadState('networkidle')

    // 임시저장 목록이 있으면 "새로 작성하기" 클릭
    const newWriteBtn2 = page.locator('button', { hasText: '새로 작성하기' })
    if (await newWriteBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newWriteBtn2.click()
      await page.waitForTimeout(500)
    }

    expect(fs.existsSync(VIDEO_FILE)).toBe(true)

    // 동영상 파일 크기 확인
    const videoSize = fs.statSync(VIDEO_FILE).size
    console.log(`[VIDEO SIZE] ${(videoSize / 1024 / 1024).toFixed(2)} MB`)

    // hidden video input에 직접 파일 세팅
    const videoInput = page.locator('input[type="file"][accept*="video"]')
    await videoInput.setInputFiles(VIDEO_FILE)

    // 업로드 완료 대기 (최대 30초)
    await page.waitForTimeout(30000)

    // 에디터에 video가 삽입됐는지 확인
    const editorVideos = page.locator('.tiptap video')
    const videoCount = await editorVideos.count()
    console.log(`[RESULT] 에디터 내 동영상 수: ${videoCount}`)

    const errorBanner = page.locator('text=업로드에 실패했어요, text=실패')
    const errorText = await errorBanner.count() > 0 ? await errorBanner.first().textContent() : '없음'
    console.log(`[ERROR BANNER] ${errorText}`)

    console.log(`[NETWORK RESPONSES] ${JSON.stringify(videoNetworkLogs)}`)

    await page.screenshot({ path: 'e2e/screenshots/upload-video-result.png', fullPage: false })

    expect(videoCount).toBeGreaterThan(0)
  })
})
