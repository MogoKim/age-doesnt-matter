import { NextRequest, NextResponse } from 'next/server'

/**
 * Threads OAuth 콜백 — 인증 코드 → short-lived → long-lived 토큰 교환
 * GET /api/threads/callback?code=...
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.json({ error, description: request.nextUrl.searchParams.get('error_description') }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ error: 'code parameter missing' }, { status: 400 })
  }

  const appId = (process.env.THREADS_APP_ID ?? '').trim()
  const appSecret = (process.env.THREADS_APP_SECRET ?? '').trim()
  const siteUrl = (process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.age-doesnt-matter.com').trim()
  const redirectUri = `${siteUrl}/api/threads/callback`

  try {
    // Step 1: code → short-lived token
    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      return NextResponse.json({ error: 'Short-lived token 발급 실패', detail: body }, { status: 500 })
    }

    const shortLived = (await tokenRes.json()) as { access_token: string; user_id: string }

    // Step 2: short-lived → long-lived token (60일)
    // POST body 사용 — URL 쿼리에 시크릿 노출 시 Vercel 로그에 기록되는 것 방지
    const longRes = await fetch('https://graph.threads.net/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'th_exchange_token',
        client_secret: appSecret,
        access_token: shortLived.access_token,
      }),
    })

    if (!longRes.ok) {
      const body = await longRes.text()
      return NextResponse.json({ error: 'Long-lived token 교환 실패', detail: body }, { status: 500 })
    }

    const longLived = (await longRes.json()) as { access_token: string; expires_in: number }

    const expiresDate = new Date(Date.now() + longLived.expires_in * 1000)

    // 토큰을 화면에 표시 (창업자가 복사해서 Vercel/GitHub Secrets에 저장)
    const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>Threads 토큰 발급 완료</title>
<style>body{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px}
.token{background:#f0f0f0;padding:12px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:14px}
.success{color:#16a34a;font-size:24px}
.info{color:#666;margin-top:8px;font-size:14px}
button{background:#FF6F61;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:16px;margin-top:12px}
</style></head>
<body>
<p class="success">Threads Access Token 발급 완료!</p>
<p><strong>User ID:</strong> ${shortLived.user_id}</p>
<p><strong>만료일:</strong> ${expiresDate.toLocaleDateString('ko-KR')} (${longLived.expires_in}초)</p>
<p><strong>Long-lived Token:</strong></p>
<div class="token" id="token">${longLived.access_token}</div>
<button onclick="navigator.clipboard.writeText(document.getElementById('token').innerText).then(()=>alert('복사됨!'))">토큰 복사</button>
<div class="info">
<p>이 토큰을 아래 2곳에 저장하세요:</p>
<ol>
<li><strong>Vercel</strong> > Settings > Environment Variables > <code>THREADS_ACCESS_TOKEN</code></li>
<li><strong>GitHub</strong> > Settings > Secrets > <code>THREADS_ACCESS_TOKEN</code></li>
</ol>
<p>⚠️ 이 페이지를 닫으면 토큰을 다시 볼 수 없습니다.</p>
</div>
</body></html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Token exchange failed', detail: String(err) }, { status: 500 })
  }
}
