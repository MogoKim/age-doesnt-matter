import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const ADMIN_COOKIE = 'admin-token'
const ADMIN_SESSION_HOURS = 4

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET 환경변수가 설정되지 않았습니다')
  }
  if (secret.length < 32) {
    throw new Error('ADMIN_JWT_SECRET은 최소 32자 이상이어야 합니다')
  }
  return new TextEncoder().encode(secret)
}

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
    .setExpirationTime(`${ADMIN_SESSION_HOURS}h`)
    .sign(getSecret())
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
    path: '/',
    maxAge: ADMIN_SESSION_HOURS * 60 * 60,
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
    const { payload } = await jwtVerify(token, getSecret())
    const adminId = typeof payload.adminId === 'string' ? payload.adminId : null
    const email = typeof payload.email === 'string' ? payload.email : null
    const nickname = typeof payload.nickname === 'string' ? payload.nickname : null
    if (!adminId || !email || !nickname) return null
    return { adminId, email, nickname }
  } catch {
    return null
  }
}

/**
 * Edge Runtime용 토큰 검증 (미들웨어에서 사용)
 */
export async function verifyAdminToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const adminId = typeof payload.adminId === 'string' ? payload.adminId : null
    const email = typeof payload.email === 'string' ? payload.email : null
    const nickname = typeof payload.nickname === 'string' ? payload.nickname : null
    if (!adminId || !email || !nickname) return null
    return { adminId, email, nickname }
  } catch {
    return null
  }
}
