import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const ADMIN_COOKIE = 'admin-token'
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-admin-secret-key-change-me')

export interface AdminSession {
  adminId: string
  email: string
  nickname: string
}

/**
 * 어드민 JWT 토큰 생성 (로그인 성공 시 호출)
 */
export async function createAdminToken(payload: AdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

/**
 * 어드민 쿠키 설정
 */
export async function setAdminCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin',
    maxAge: 7 * 24 * 60 * 60, // 7일
  })
}

/**
 * 어드민 쿠키 삭제 (로그아웃)
 */
export async function clearAdminCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE)
}

/**
 * 현재 어드민 세션 가져오기 (서버 컴포넌트용)
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      nickname: payload.nickname as string,
    }
  } catch {
    return null
  }
}

/**
 * Edge Runtime용 토큰 검증 (미들웨어에서 사용)
 */
export async function verifyAdminToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      nickname: payload.nickname as string,
    }
  } catch {
    return null
  }
}
