import { prisma } from '@/lib/prisma'
import { sanitizeHtml } from '@/lib/sanitize'
import type { PopupTarget, PopupType } from '@/generated/prisma/client'

export interface PopupData {
  id: string
  type: PopupType
  target: PopupTarget
  targetPaths: string[]
  title: string | null
  /** 서버에서 SANITIZE_OPTIONS로 정화된 HTML — 클라이언트는 sanitize 없이 그대로 주입.
   *  raw content는 공개 응답에 노출하지 않는다(클라이언트 번들에서 sanitize-html 제거 목적). */
  sanitizedContentHtml: string | null
  imageUrl: string | null
  linkUrl: string | null
  buttonText: string | null
  showOncePerDay: boolean
  hideForDays: number | null
  priority: number
}

/** matchesPath용 내부 타입 — target/targetPaths만 사용 */
type PopupMatchFields = Pick<PopupData, 'target' | 'targetPaths'>

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

  return popups
    .filter((p) => matchesPath(p, path))
    .map(({ content, ...rest }): PopupData => ({
      ...rest,
      sanitizedContentHtml: content ? sanitizeHtml(content) : null,
    }))
}

function matchesPath(popup: PopupMatchFields, path: string): boolean {
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
    case 'LIFE2':
      return path.startsWith('/life2')
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
