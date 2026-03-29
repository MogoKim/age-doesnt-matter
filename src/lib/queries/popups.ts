import { prisma } from '@/lib/prisma'
import type { PopupTarget, PopupType } from '@/generated/prisma/client'

export interface PopupData {
  id: string
  type: PopupType
  target: PopupTarget
  targetPaths: string[]
  title: string | null
  content: string | null
  imageUrl: string | null
  linkUrl: string | null
  buttonText: string | null
  showOncePerDay: boolean
  hideForDays: number | null
  priority: number
}

/** 현재 경로에 매칭되는 활성 팝업 조회 */
export async function getActivePopups(path: string): Promise<PopupData[]> {
  const now = new Date()

  const popups = await prisma.popup.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      type: true,
      target: true,
      targetPaths: true,
      title: true,
      content: true,
      imageUrl: true,
      linkUrl: true,
      buttonText: true,
      showOncePerDay: true,
      hideForDays: true,
      priority: true,
    },
  })

  return popups.filter((p) => matchesPath(p, path))
}

function matchesPath(popup: PopupData, path: string): boolean {
  switch (popup.target) {
    case 'ALL':
      return true
    case 'HOME':
      return path === '/' || path === ''
    case 'COMMUNITY':
      return path.startsWith('/community')
    case 'JOBS':
      return path.startsWith('/jobs')
    case 'MAGAZINE':
      return path.startsWith('/magazine')
    case 'CUSTOM':
      return popup.targetPaths.some((tp) => path.startsWith(tp))
    default:
      return false
  }
}

/** 팝업 노출 수 증가 */
export async function incrementPopupImpressions(popupId: string): Promise<void> {
  await prisma.popup.update({
    where: { id: popupId },
    data: { impressions: { increment: 1 } },
  })
}

/** 팝업 클릭 수 증가 */
export async function incrementPopupClicks(popupId: string): Promise<void> {
  await prisma.popup.update({
    where: { id: popupId },
    data: { clicks: { increment: 1 } },
  })
}
