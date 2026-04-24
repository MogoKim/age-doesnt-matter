/**
 * Google Ads OAuth2 Refresh Token 발급 헬퍼 (localhost 방식)
 *
 * 사용법:
 *   npx tsx agents/marketing/google-ads/scripts/get-refresh-token.ts
 *
 * 사전 조건:
 *   .env.local에 다음 항목 설정:
 *     GOOGLE_ADS_CLIENT_ID=...
 *     GOOGLE_ADS_CLIENT_SECRET=...
 *
 * 과정:
 *   1. 이 스크립트 실행 → 브라우저 URL 출력
 *   2. URL 접속 → 구글 계정 승인
 *   3. 자동으로 localhost:8080으로 리디렉션 → refresh_token 출력
 *
 * // LOCAL ONLY — 최초 1회만 실행, 크론 불필요
 */

import * as https from 'https'
import * as http from 'http'
import { URL } from 'url'

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ .env.local에 GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET를 먼저 설정하세요')
  process.exit(1)
}

const REDIRECT_URI = 'http://localhost:8080'
const SCOPE = 'https://www.googleapis.com/auth/adwords'

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPE)}&` +
  `access_type=offline&` +
  `prompt=consent`

console.log('\n' + '='.repeat(60))
console.log('Google Ads OAuth2 Refresh Token 발급')
console.log('='.repeat(60))
console.log('\n아래 URL을 브라우저에서 열고 구글 계정으로 승인하세요:\n')
console.log(authUrl)
console.log('\n승인 후 자동으로 토큰이 출력됩니다...\n')

// localhost:8080에서 callback 수신
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:8080`)
  const code = url.searchParams.get('code')

  if (!code) {
    res.end('code 파라미터가 없습니다.')
    return
  }

  res.end('<html><body><h2>✅ 인증 완료! 터미널을 확인하세요.</h2></body></html>')
  server.close()

  const postData = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString()

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
    },
  }

  const tokenReq = https.request(options, (tokenRes) => {
    let body = ''
    tokenRes.on('data', (chunk: Buffer) => { body += chunk.toString() })
    tokenRes.on('end', () => {
      try {
        const token = JSON.parse(body) as {
          refresh_token?: string
          access_token?: string
          error?: string
          error_description?: string
        }

        if (token.error) {
          console.error('\n❌ 오류:', token.error, '-', token.error_description)
          process.exit(1)
        }

        if (!token.refresh_token) {
          console.error('\n❌ refresh_token이 없습니다.')
          process.exit(1)
        }

        console.log('\n' + '='.repeat(60))
        console.log('✅ Refresh Token 발급 완료!')
        console.log('='.repeat(60))
        console.log('\n.env.local에 다음을 추가하세요:')
        console.log(`\nGOOGLE_ADS_REFRESH_TOKEN=${token.refresh_token}`)
        console.log('\nGitHub Secrets에도 동일하게 추가하세요:')
        console.log('  Settings → Secrets and variables → Actions → New repository secret')
        console.log('  Name: GOOGLE_ADS_REFRESH_TOKEN')
        console.log(`  Value: ${token.refresh_token}`)
        console.log('\n' + '='.repeat(60))
      } catch {
        console.error('\n❌ 응답 파싱 실패:', body)
        process.exit(1)
      }
    })
  })

  tokenReq.on('error', (err: Error) => {
    console.error('\n❌ 요청 오류:', err.message)
    process.exit(1)
  })

  tokenReq.write(postData)
  tokenReq.end()
})

server.listen(8080, () => {
  console.log('localhost:8080 대기 중...')
})
