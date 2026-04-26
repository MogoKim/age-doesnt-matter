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

// ─── 히어로 배너 (Phase 3 신규 스키마 기반) ───

export async function adminCreateBanner(data: {
  title: string
  subtitle?: string
  themeColor: string
  themeColorMid?: string
  themeColorEnd?: string
  ctaText?: string
  ctaUrl?: string
  displayOrder?: number
  slot?: string
  startsAt?: string   // ISO date string, optional
  endsAt?: string     // ISO date string, optional
  isActive?: boolean
}) {
  const admin = await requireAdmin()

  const startsAtDate = data.startsAt ? new Date(data.startsAt) : null
  const endsAtDate = data.endsAt ? new Date(data.endsAt) : null

  if (startsAtDate && endsAtDate && startsAtDate >= endsAtDate) {
    throw new Error('시작일은 종료일보다 이전이어야 합니다.')
  }

  const banner = await prisma.banner.create({
    data: {
      title: data.title,
      subtitle: data.subtitle,
      themeColor: data.themeColor,
      themeColorMid: data.themeColorMid,
      themeColorEnd: data.themeColorEnd,
      ctaText: data.ctaText,
      ctaUrl: data.ctaUrl,
      displayOrder: data.displayOrder ?? 0,
      slot: data.slot ?? 'HERO',
      isActive: data.isActive ?? true,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      // 레거시 NOT NULL 필드 — 구버전 HeroSlider 호환용 (imageUrl: 미사용, 빈 문자열 유지)
      imageUrl: '',
      startDate: startsAtDate ?? new Date(),
      endDate: endsAtDate ?? new Date('2099-12-31'),
      priority: data.displayOrder ?? 0,
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
  revalidatePath('/')
}

export async function adminUpdateBanner(
  bannerId: string,
  data: {
    title?: string
    subtitle?: string
    themeColor?: string
    themeColorMid?: string
    themeColorEnd?: string
    ctaText?: string
    ctaUrl?: string
    displayOrder?: number
    slot?: string
    startsAt?: string
    endsAt?: string
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  const startsAtDate = data.startsAt ? new Date(data.startsAt) : undefined
  const endsAtDate = data.endsAt ? new Date(data.endsAt) : undefined

  if (startsAtDate && endsAtDate && startsAtDate >= endsAtDate) {
    throw new Error('시작일은 종료일보다 이전이어야 합니다.')
  }

  const existing = await prisma.banner.findUnique({ where: { id: bannerId } })

  await prisma.banner.update({
    where: { id: bannerId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
      ...(data.themeColor !== undefined && { themeColor: data.themeColor }),
      ...(data.themeColorMid !== undefined && { themeColorMid: data.themeColorMid }),
      ...(data.themeColorEnd !== undefined && { themeColorEnd: data.themeColorEnd }),
      ...(data.ctaText !== undefined && { ctaText: data.ctaText }),
      ...(data.ctaUrl !== undefined && { ctaUrl: data.ctaUrl }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder, priority: data.displayOrder }),
      ...(data.slot !== undefined && { slot: data.slot }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(startsAtDate !== undefined && { startsAt: startsAtDate, startDate: startsAtDate }),
      ...(endsAtDate !== undefined && { endsAt: endsAtDate, endDate: endsAtDate }),
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
  revalidatePath('/')
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
  revalidatePath('/')
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
