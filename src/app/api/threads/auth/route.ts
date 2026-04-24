import { NextResponse } from 'next/server'

/**
 * Threads OAuth 시작 — 브라우저에서 접속하면 Meta 로그인 페이지로 리다이렉트
 * GET /api/threads/auth
 */
export async function GET() {
  const appId = process.env.THREADS_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'THREADS_APP_ID not configured' }, { status: 500 })
  }

  const siteUrl = (process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.age-doesnt-matter.com').trim()
  const redirectUri = `${siteUrl}/api/threads/callback`

  const scopes = [
    'threads_basic',
    'threads_content_publish',
    'threads_read_replies',
    'threads_manage_insights',
  ].join(',')

  const authUrl = `https://threads.net/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code`

  return NextResponse.redirect(authUrl)
}
