'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { AdSlot, AdType } from '@/generated/prisma/client'

/** 광고 HTML 코드에서 위험한 태그/속성 제거 */
function sanitizeHtmlCode(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[\s\S]*?\/?>/gi, '')
}

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// ─── 히어로 배너 ───

export async function adminCreateBanner(data: {
  title: string
  description?: string
  imageUrl: string
  linkUrl?: string
  startDate: string
  endDate: string
  priority?: number
}) {
  const admin = await requireAdmin()

  const start = new Date(data.startDate)
  const end = new Date(data.endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('올바른 날짜 형식이 아닙니다.')
  }
  if (start >= end) {
    throw new Error('시작일은 종료일보다 이전이어야 합니다.')
  }

  const banner = await prisma.banner.create({
    data: {
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      linkUrl: data.linkUrl,
      startDate: start,
      endDate: end,
      priority: data.priority ?? 0,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_CREATE',
      targetType: 'BANNER',
      targetId: banner.id,
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminUpdateBanner(
  bannerId: string,
  data: {
    title?: string
    description?: string
    imageUrl?: string
    linkUrl?: string
    startDate?: string
    endDate?: string
    priority?: number
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('올바른 날짜 형식이 아닙니다.')
    }
    if (start >= end) {
      throw new Error('시작일은 종료일보다 이전이어야 합니다.')
    }
  }

  const existing = await prisma.banner.findUnique({ where: { id: bannerId } })

  await prisma.banner.update({
    where: { id: bannerId },
    data: {
      ...data,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_UPDATE',
      targetType: 'BANNER',
      targetId: bannerId,
      before: existing ? JSON.stringify(existing) : undefined,
      after: JSON.stringify(data),
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminDeleteBanner(bannerId: string) {
  const admin = await requireAdmin()

  await prisma.banner.delete({ where: { id: bannerId } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_DELETE',
      targetType: 'BANNER',
      targetId: bannerId,
    },
  })

  revalidatePath('/admin/banners')
}

// ─── 광고 배너 ───

export async function adminCreateAdBanner(data: {
  slot: AdSlot
  adType: AdType
  title?: string
  imageUrl?: string
  htmlCode?: string
  clickUrl?: string
  startDate: string
  endDate: string
  priority?: number
}) {
  const admin = await requireAdmin()

  const sanitizedHtmlCode = data.htmlCode ? sanitizeHtmlCode(data.htmlCode) : data.htmlCode

  const ad = await prisma.adBanner.create({
    data: {
      slot: data.slot,
      adType: data.adType,
      title: data.title,
      imageUrl: data.imageUrl,
      htmlCode: sanitizedHtmlCode,
      clickUrl: data.clickUrl,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      priority: data.priority ?? 0,
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AD_CREATE',
      targetType: 'AD',
      targetId: ad.id,
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminUpdateAdBanner(
  adId: string,
  data: {
    title?: string
    imageUrl?: string
    htmlCode?: string
    clickUrl?: string
    startDate?: string
    endDate?: string
    priority?: number
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  const existing = await prisma.adBanner.findUnique({ where: { id: adId } })

  const sanitizedHtmlCode = data.htmlCode ? sanitizeHtmlCode(data.htmlCode) : data.htmlCode

  await prisma.adBanner.update({
    where: { id: adId },
    data: {
      ...data,
      htmlCode: sanitizedHtmlCode,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.endDate && { endDate: new Date(data.endDate) }),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AD_UPDATE',
      targetType: 'AD',
      targetId: adId,
      before: existing ? JSON.stringify(existing) : undefined,
      after: JSON.stringify(data),
    },
  })

  revalidatePath('/admin/banners')
}

export async function adminDeleteAdBanner(adId: string) {
  const admin = await requireAdmin()

  await prisma.adBanner.delete({ where: { id: adId } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'AD_DELETE',
      targetType: 'AD',
      targetId: adId,
    },
  })

  revalidatePath('/admin/banners')
}
