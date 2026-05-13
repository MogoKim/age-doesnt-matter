/**
 * 네이버 블로그 계정 쿠키 추출
 * Chrome Profile 2 (hihihihi1023)의 암호화된 쿠키를 복호화하여 blog-storage-state.json 저장
 *
 * 사전 조건:
 *   1. Chrome에서 hihihihi1023 계정을 Profile 2로 로그인
 *   2. Chrome 완전히 종료 (쿠키 DB 잠금 해제)
 *   3. 이 스크립트 실행
 *
 * 사용법:
 *   npx tsx agents/naver-blog/export-blog-cookies.ts
 *
 * BLOG_CHROME_PROFILE 변경 시:
 *   BLOG_CHROME_PROFILE="Profile 3" npx tsx agents/naver-blog/export-blog-cookies.ts
 */

import { execSync } from 'child_process'
import { writeFileSync, existsSync, rmSync, mkdtempSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { CHROME_USER_DATA_DIR, BLOG_CHROME_PROFILE, BLOG_STORAGE_STATE_PATH, BLOG_HALTED_FLAG } from './config.js'


async function main() {
  console.log('[ExportBlogCookies] 네이버 블로그 계정 쿠키 추출')
  console.log(`[ExportBlogCookies] Chrome 프로필: ${BLOG_CHROME_PROFILE}`)
  console.log(`[ExportBlogCookies] 계정: k-agelab@naver.com (blog.naver.com/age-doesnt-matter)`)

  const cookieFile = resolve(CHROME_USER_DATA_DIR, BLOG_CHROME_PROFILE, 'Cookies')
  console.log(`[ExportBlogCookies] 쿠키 DB: ${cookieFile}`)

  if (!existsSync(cookieFile)) {
    console.error(`[ExportBlogCookies] ❌ 쿠키 파일 없음: ${cookieFile}`)
    console.error('[ExportBlogCookies] → Chrome에서 hihihihi1023 계정을 새 프로필로 로그인한 뒤 Chrome 완전 종료 후 재실행')
    process.exit(1)
  }

  // Python browser_cookie3로 암호화된 Chrome 쿠키 복호화 (export-cookies.ts와 동일 패턴)
  const pythonScript = `
import browser_cookie3, json, sys
cookie_file = sys.argv[1]
cj = browser_cookie3.chrome(domain_name='.naver.com', cookie_file=cookie_file)
cookies = []
for c in cj:
    if 'naver' in c.domain:
        cookies.append({
            "name": c.name, "value": c.value, "domain": c.domain,
            "path": c.path, "expires": c.expires or -1,
            "httpOnly": False, "secure": bool(c.secure), "sameSite": "Lax"
        })
print(json.dumps(cookies, ensure_ascii=False))
`

  const tmpDir = mkdtempSync(resolve(tmpdir(), 'naver-blog-cookies-'))
  const tmpScript = resolve(tmpDir, 'extract.py')
  writeFileSync(tmpScript, pythonScript)

  let result: string
  try {
    result = execSync(
      `python3 ${JSON.stringify(tmpScript)} ${JSON.stringify(cookieFile)}`,
      { encoding: 'utf-8', timeout: 15000 },
    ).trim()
  } finally {
    try { unlinkSync(tmpScript) } catch { /* ignore */ }
    try { rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }
  }

  const cookies: Array<{
    name: string; value: string; domain: string; path: string
    expires: number; httpOnly: boolean; secure: boolean; sameSite: string
  }> = JSON.parse(result)

  const hasNidAut = cookies.some(c => c.name === 'NID_AUT')
  const hasNidSes = cookies.some(c => c.name === 'NID_SES')

  console.log(`[ExportBlogCookies] NID_AUT: ${hasNidAut ? '✅' : '❌'}`)
  console.log(`[ExportBlogCookies] NID_SES: ${hasNidSes ? '✅' : '❌'}`)
  console.log(`[ExportBlogCookies] 총 네이버 쿠키: ${cookies.length}개`)

  if (!hasNidAut || !hasNidSes) {
    console.error('[ExportBlogCookies] ❌ 핵심 인증 쿠키 누락!')
    console.error('[ExportBlogCookies] → Chrome에서 hihihihi1023으로 네이버 로그인 후 Chrome 종료 후 재실행')
    process.exit(1)
  }

  const storageState = { cookies, origins: [] }
  writeFileSync(BLOG_STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))

  // BLOG_HALTED 플래그 해제 (쿠키 갱신으로 세션 복구)
  if (existsSync(BLOG_HALTED_FLAG)) {
    rmSync(BLOG_HALTED_FLAG, { force: true })
    console.log('[ExportBlogCookies] BLOG_HALTED 플래그 해제 — 블로그 포스터 재가동 가능')
  }

  console.log(`[ExportBlogCookies] ✅ 저장 완료: ${BLOG_STORAGE_STATE_PATH}`)
  console.log('[ExportBlogCookies] 다음 단계: npx tsx agents/naver-blog/session-manager.ts (세션 검증)')
}

main().catch(err => {
  console.error('[ExportBlogCookies] 오류:', err)
  process.exit(1)
})
