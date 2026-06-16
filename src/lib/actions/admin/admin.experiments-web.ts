'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// 웹 A/B 실험 운영 상태 저장 (ExperimentState upsert)
// startedAt/endedAt 는 상태 전이에 따라 자동: ACTIVE 진입 시 시작일, CONCLUDED 시 종료일.
export async function adminSaveExperimentState(
  experimentId: string,
  data: { status: string; owner?: string; note?: string; conclusion?: string },
) {
  const admin = await requireAdmin()

  const before = await prisma.experimentState.findUnique({ where: { experimentId } })
  const now = new Date()

  const payload = {
    status: data.status,
    owner: data.owner?.trim() || null,
    note: data.note?.trim() || null,
    conclusion: data.conclusion?.trim() || null,
    startedAt: before?.startedAt ?? (data.status === 'ACTIVE' ? now : null),
    endedAt: data.status === 'CONCLUDED' ? (before?.endedAt ?? now) : null,
  }

  await prisma.experimentState.upsert({
    where: { experimentId },
    create: { experimentId, ...payload },
    update: payload,
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'EXPERIMENT_STATE_UPDATE',
      targetType: 'EXPERIMENT',
      targetId: experimentId,
      before: before ? { status: before.status, owner: before.owner } : undefined,
      after: { status: payload.status, owner: payload.owner },
    },
  })

  revalidatePath('/admin/ab-tests')
  // 리텐션 집계(unstable_cache tags:['experiment-state'])를 즉시 무효화 — startedAt/status 변경이 화면에 바로 반영.
  // (데이터 저장은 위 upsert 로 이미 정확. 이 태그 무효화는 "화면 지연"만 해소.)
  revalidateTag('experiment-state')
}
