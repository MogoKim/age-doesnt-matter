/**
 * 네이버 지식인 답변 전용 쿠키 추출 스크립트
 * (기존 export-cookies.ts와 동일하지만 별도 계정/파일에 저장)
 *
 * 사용법: Chrome 완전히 종료 후 실행
 *   npx tsx agents/cafe/export-cookies-jisik.ts
 *
 * 저장 위치: agents/cafe/storage-state-jisik.json
 *
 * 중요: 카페 크롤링 계정(storage-state.json)과 반드시 분리!
 *   - 카페 크롤링 봇 패턴이 쌓인 계정 = 지식인 쓰기 시 탐지 위험 상승
 *   - 지식인 답변 전용 네이버 계정으로 로그인된 Chrome에서 추출
 */
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CHROME_USER_DATA_DIR, CHROME_PROFILE } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state-jisik.json')

async function main() {
  const cookieFile = resolve(CHROME_USER_DATA_DIR, CHROME_PROFILE, 'Cookies')
  console.log('[ExportCookiesJisik] 지식인 답변 전용 쿠키 추출')
  console.log(`[ExportCookiesJisik] Chrome 쿠키 DB: ${cookieFile}`)
  console.log('[ExportCookiesJisik] ⚠️  카페 크롤링 계정이 아닌 지식인 답변 전용 계정으로 로그인된 Chrome에서 실행하세요')

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

  const hasNidAut = cookies.some((c) => c.name === 'NID_AUT')
  const hasNidSes = cookies.some((c) => c.name === 'NID_SES')

  console.log(`[ExportCookiesJisik] NID_AUT: ${hasNidAut ? '✅' : '❌'}`)
  console.log(`[ExportCookiesJisik] NID_SES: ${hasNidSes ? '✅' : '❌'}`)
  console.log(`[ExportCookiesJisik] 총 네이버 쿠키: ${cookies.length}개`)

  if (!hasNidAut || !hasNidSes) {
    console.error('[ExportCookiesJisik] ❌ 핵심 인증 쿠키 누락! 네이버에 로그인되어 있는지 확인하세요.')
    process.exit(1)
  }

  const storageState = { cookies, origins: [] }
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
  console.log(`[ExportCookiesJisik] ✅ 저장 완료: ${STORAGE_STATE_PATH}`)
  console.log('[ExportCookiesJisik] 이 파일은 지식인 답변 전용으로만 사용됩니다.')
}

main().catch((err) => {
  console.error('[ExportCookiesJisik] 오류:', err)
  process.exit(1)
})
