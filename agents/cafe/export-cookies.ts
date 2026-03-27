/**
 * 네이버 쿠키 추출 스크립트
 * Chrome 프로필의 암호화된 쿠키를 Python browser_cookie3로 복호화하여 추출
 *
 * 사용법: Chrome 완전히 종료 후 실행
 *   npx tsx agents/cafe/export-cookies.ts
 *
 * 주의: Chrome이 쿠키 DB를 잠그므로 반드시 Chrome 종료 후 실행해야 함
 * 핵심 쿠키: NID_AUT, NID_SES (네이버 로그인 인증)
 */
import { execSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CHROME_USER_DATA_DIR, CHROME_PROFILE } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')

async function main() {
  const cookieFile = resolve(CHROME_USER_DATA_DIR, CHROME_PROFILE, 'Cookies')
  console.log('[ExportCookies] Chrome 쿠키 DB에서 네이버 쿠키 복호화 추출')
  console.log(`[ExportCookies] 쿠키 DB: ${cookieFile}`)

  // Python browser_cookie3로 암호화된 Chrome 쿠키 복호화
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

  const result = execSync(
    `python3 -c ${JSON.stringify(pythonScript)} ${JSON.stringify(cookieFile)}`,
    { encoding: 'utf-8', timeout: 15000 },
  ).trim()

  const cookies: Array<{name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: string}> = JSON.parse(result)

  // 핵심 쿠키 검증
  const hasNidAut = cookies.some(c => c.name === 'NID_AUT')
  const hasNidSes = cookies.some(c => c.name === 'NID_SES')

  console.log(`[ExportCookies] NID_AUT: ${hasNidAut ? '✅' : '❌'}`)
  console.log(`[ExportCookies] NID_SES: ${hasNidSes ? '✅' : '❌'}`)
  console.log(`[ExportCookies] 총 네이버 쿠키: ${cookies.length}개`)

  if (!hasNidAut || !hasNidSes) {
    console.error('[ExportCookies] ❌ 핵심 인증 쿠키 누락! Chrome에서 네이버에 로그인되어 있는지 확인하세요.')
    process.exit(1)
  }

  // storage-state.json 저장
  const storageState = { cookies, origins: [] }
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
  console.log(`[ExportCookies] ✅ 저장 완료: ${STORAGE_STATE_PATH}`)
}

main().catch(err => {
  console.error('[ExportCookies] 오류:', err)
  process.exit(1)
})
