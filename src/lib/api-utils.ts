import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { AppError, UnauthorizedError, ForbiddenError } from '@/lib/errors'
import type { Grade } from '@/types/api'
import { GRADE_ORDER } from '@/types/api'

/** 성공 응답 헬퍼 */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

/** cursor + limit 파라미터 파싱 — 4개 목록 API 공통 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  options?: { maxLimit?: number; defaultLimit?: number },
): { cursor: string | undefined; limit: number } {
  const maxLimit = options?.maxLimit ?? 50
  const defaultLimit = options?.defaultLimit ?? 10
  const cursor = searchParams.get('cursor') ?? undefined
  const raw = parseInt(searchParams.get('limit') ?? '', 10)
  const limit = isNaN(raw) ? defaultLimit : Math.min(raw, maxLimit)
  return { cursor, limit }
}

/** 성공 응답 + 페이지네이션 */
export function okList<T>(
  data: T[],
  meta: { total: number; cursor: string | null; hasMore: boolean },
) {
  return NextResponse.json({ ok: true, data, meta })
}

/** 에러 응답 핸들러 */
export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode },
    )
  }

  console.error('Unhandled error:', error)
  return NextResponse.json(
    {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했어요' },
    },
    { status: 500 },
  )
}

/** 로그인 필수 가드 — 세션 user 반환 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()
  return session.user
}

/** 어드민 가드 */
export async function requireAdmin() {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') throw new ForbiddenError()
  return user
}

/** 최소 등급 가드 */
export async function requireGrade(minGrade: Grade) {
  const user = await requireAuth()
  const userGrade = user.grade as Grade
  if (GRADE_ORDER[userGrade] < GRADE_ORDER[minGrade]) {
    throw new ForbiddenError(
      `${minGrade} 등급 이상만 가능해요`,
    )
  }
  return user
}
