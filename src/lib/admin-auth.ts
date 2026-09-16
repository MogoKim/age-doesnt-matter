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

/**
 * 어드민 server action 가드 — 세션이 없으면 던진다.
 *
 * ── 왜 여기인가 ─────────────────────────────────────────────
 *  같은 4줄이 어드민 액션 파일 **10곳**에 복사돼 있었다(호출 42회).
 *  세션 해석·만료 검증은 이미 이 모듈(`getAdminSession`)의 책임이므로,
 *  "세션이 없으면 거절한다"는 규칙도 여기 있는 게 맞다.
 *
 * ── 🔴 다른 두 인증과 섞지 마라 ──────────────────────────────
 *   · `lib/api-utils.ts` 의 `requireAdmin` — **NextAuth 세션 + role==='ADMIN'**,
 *     `ForbiddenError` 를 던진다. 공개 API 용이고 **체계가 다르다.**
 *   · `app/admin/(panel)/vote-events/actions.ts` — 같은 `getAdminSession` 을 쓰지만
 *     던지지 않고 `{ error }` 를 **반환**한다. 계약이 다르다.
 *  셋을 합치면 인증 동작이 바뀐다. `admin-require-admin.test.ts` 가 분리를 고정한다.
 *
 * ── 🔴 여기에 권한(role) 검사를 추가하지 마라 ────────────────
 *  이 체계는 admin-token 의 존재·유효성만 본다. role 분기를 "개선"으로 넣으면
 *  권한 모델이 바뀐다 — 이 배치 범위 밖이다.
 *
 * 에러는 `Error('관리자 인증이 필요합니다.')` 그대로 유지한다 —
 * 어드민 화면 일부가 이 문구를 그대로 사용자에게 보여준다.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}
