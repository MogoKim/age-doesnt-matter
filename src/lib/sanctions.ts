import { prisma } from '@/lib/prisma'

/**
 * 제재(SUSPENDED/BANNED) 상태면 작성 차단 사유 메시지를, 아니면 null을 반환한다.
 *
 * 제재 차단은 원래 signIn 콜백(새 로그인 시점)에서만 작동하므로,
 * 이미 로그인한 유저는 세션(maxAge 30일)이 살아있는 동안 글/댓글을 계속 쓸 수 있었다.
 * 이 헬퍼를 글/댓글 작성 server action 진입부에서 호출해 작성 시점에 즉시 차단한다.
 *
 * - 만료된 SUSPENDED는 통과(null) — 실제 ACTIVE 복원은 signIn 콜백이 담당.
 * - WITHDRAWN은 로그인 자체가 불가하므로 별도 처리하지 않는다.
 */
export async function getWriteBlockReason(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, suspendedUntil: true },
  })
  if (!u) return null

  if (u.status === 'BANNED') {
    return '계정이 영구 차단되어 글을 작성할 수 없습니다.'
  }

  if (u.status === 'SUSPENDED' && u.suspendedUntil && u.suspendedUntil > new Date()) {
    const until = u.suspendedUntil.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    return `계정이 정지되어 ${until}까지 글을 작성할 수 없습니다.`
  }

  return null
}
