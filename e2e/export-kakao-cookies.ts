/**
 * 우나어 서비스 로그인 쿠키 추출 → e2e/.auth/user.json 저장
 *
 * 사용법 (Chrome 완전히 종료 후 실행):
 *   npx tsx e2e/export-kakao-cookies.ts
 *
 * 전제조건:
 *   - Chrome Profile 1에 age-doesnt-matter.com 카카오 로그인 상태
 *   - pip install browser-cookie3 (Python 패키지)
 *
 * 생성 파일: e2e/.auth/user.json (세션 유효기간 약 30일)
 * 주의: .gitignore에 e2e/.auth/ 포함 — 커밋하지 말 것
 */
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CHROME_USER_DATA_DIR, CHROME_PROFILE } from '../agents/cafe/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AUTH_PATH = resolve(__dirname, '.auth/user.json')

async function main() {
  const cookieFile = resolve(CHROME_USER_DATA_DIR, CHROME_PROFILE, 'Cookies')

  console.log('[ExportKakaoCookies] 우나어 로그인 쿠키 추출 시작')
  console.log(`[ExportKakaoCookies] Chrome 쿠키 DB: ${cookieFile}`)
  console.log('[ExportKakaoCookies] ⚠️  Chrome을 완전히 종료한 후 실행하세요')

  const pythonScript = `
import browser_cookie3, json, sys
cookie_file = sys.argv[1]
cookies = []
# age-doesnt-matter.com + vercel.app 도메인 모두 추출
for domain_name in ['age-doesnt-matter.com', '.age-doesnt-matter.com', 'vercel.app']:
    try:
        cj = browser_cookie3.chrome(domain_name=domain_name, cookie_file=cookie_file)
        for c in cj:
            cookies.append({
                "name": c.name, "value": c.value, "domain": c.domain,
                "path": c.path, "expires": c.expires or -1,
                "httpOnly": False, "secure": bool(c.secure), "sameSite": "Lax"
            })
    except Exception:
        pass
# 중복 제거
seen = set()
unique = []
for c in cookies:
    key = (c['name'], c['domain'])
    if key not in seen:
        seen.add(key)
        unique.append(c)
print(json.dumps(unique, ensure_ascii=False))
`

  const result = execSync(
    `python3 -c ${JSON.stringify(pythonScript)} ${JSON.stringify(cookieFile)}`,
    { encoding: 'utf-8', timeout: 15000 },
  ).trim()

  const cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: string
  }> = JSON.parse(result)

  // NextAuth 세션 쿠키 확인
  const hasNextAuthSession = cookies.some(
    (c) => c.name === 'next-auth.session-token' || c.name === '__Secure-next-auth.session-token',
  )

  console.log(`[ExportKakaoCookies] next-auth.session-token: ${hasNextAuthSession ? '✅' : '❌'}`)
  console.log(`[ExportKakaoCookies] 총 쿠키: ${cookies.length}개`)
  console.log(`[ExportKakaoCookies] 도메인별:`)
  const byDomain = cookies.reduce<Record<string, number>>((acc, c) => {
    acc[c.domain] = (acc[c.domain] ?? 0) + 1
    return acc
  }, {})
  Object.entries(byDomain).forEach(([domain, count]) => {
    console.log(`  ${domain}: ${count}개`)
  })

  if (!hasNextAuthSession) {
    console.error('[ExportKakaoCookies] ❌ 세션 쿠키 없음! 브라우저에서 카카오 로그인 후 재실행하세요.')
    process.exit(1)
  }

  const storageState = { cookies, origins: [] }
  writeFileSync(AUTH_PATH, JSON.stringify(storageState, null, 2))
  console.log(`[ExportKakaoCookies] ✅ 저장 완료: ${AUTH_PATH}`)
  console.log('[ExportKakaoCookies] 이 파일로 qa-user 테스트가 인증된 상태로 실행됩니다.')
}

main().catch((err) => {
  console.error('[ExportKakaoCookies] 오류:', err)
  process.exit(1)
})
