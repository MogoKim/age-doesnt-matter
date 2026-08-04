'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { validateCtaUrlForSave } from '@/lib/hero-link'
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

function normalizeBannerText(value: string | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeBannerImageUrl(value: string | null | undefined) {
  if (typeof value !== 'string') return undefined
  return value.trim()
}

function normalizeBannerTitle(value: string) {
  return value.trim().replace(/\\n/g, '\n')
}

function revalidateHeroBanners() {
  revalidateTag('hero-banners')
  revalidatePath('/admin/banners')
  revalidatePath('/')
}

// ─── 히어로 배너 (Phase 3 신규 스키마 기반) ───

export async function adminCreateBanner(data: {
  title: string
  subtitle?: string | null
  themeColor: string
  themeColorMid?: string | null
  themeColorEnd?: string | null
  ctaText?: string | null
  ctaUrl?: string | null
  imageUrl?: string | null
  displayOrder?: number
  slot?: string
  startsAt?: string | null   // ISO date string, optional
  endsAt?: string | null     // ISO date string, optional
  isActive?: boolean
}) {
  const admin = await requireAdmin()

  const startsAtDate = data.startsAt ? new Date(data.startsAt) : null
  const endsAtDate = data.endsAt ? new Date(data.endsAt) : null
  const ctaUrl = normalizeBannerText(data.ctaUrl)

  if (startsAtDate && endsAtDate && startsAtDate >= endsAtDate) {
    throw new Error('시작일은 종료일보다 이전이어야 합니다.')
  }

  const ctaError = validateCtaUrlForSave(ctaUrl)
  if (ctaError) throw new Error(`CTA 링크: ${ctaError}`)

  const banner = await prisma.banner.create({
    data: {
      title: normalizeBannerTitle(data.title),
      subtitle: normalizeBannerText(data.subtitle),
      themeColor: data.themeColor,
      themeColorMid: normalizeBannerText(data.themeColorMid),
      themeColorEnd: normalizeBannerText(data.themeColorEnd),
      ctaText: normalizeBannerText(data.ctaText),
      ctaUrl,
      displayOrder: data.displayOrder ?? 0,
      slot: data.slot ?? 'HERO',
      isActive: data.isActive ?? true,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      imageUrl: normalizeBannerImageUrl(data.imageUrl) ?? '',
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

  revalidateHeroBanners()
}

export async function adminUpdateBanner(
  bannerId: string,
  data: {
    title?: string
    subtitle?: string | null
    themeColor?: string
    themeColorMid?: string | null
    themeColorEnd?: string | null
    ctaText?: string | null
    ctaUrl?: string | null
    imageUrl?: string | null
    displayOrder?: number
    slot?: string
    startsAt?: string | null
    endsAt?: string | null
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  const startsAtDate = data.startsAt === undefined ? undefined : data.startsAt ? new Date(data.startsAt) : null
  const endsAtDate = data.endsAt === undefined ? undefined : data.endsAt ? new Date(data.endsAt) : null

  if (startsAtDate && endsAtDate && startsAtDate >= endsAtDate) {
    throw new Error('시작일은 종료일보다 이전이어야 합니다.')
  }

  if (data.ctaUrl !== undefined) {
    const ctaError = validateCtaUrlForSave(normalizeBannerText(data.ctaUrl))
    if (ctaError) throw new Error(`CTA 링크: ${ctaError}`)
  }

  const existing = await prisma.banner.findUnique({ where: { id: bannerId } })

  await prisma.banner.update({
    where: { id: bannerId },
    data: {
      ...(data.title !== undefined && { title: normalizeBannerTitle(data.title) }),
      ...(data.subtitle !== undefined && { subtitle: normalizeBannerText(data.subtitle) }),
      ...(data.themeColor !== undefined && { themeColor: data.themeColor }),
      ...(data.themeColorMid !== undefined && { themeColorMid: normalizeBannerText(data.themeColorMid) }),
      ...(data.themeColorEnd !== undefined && { themeColorEnd: normalizeBannerText(data.themeColorEnd) }),
      ...(data.ctaText !== undefined && { ctaText: normalizeBannerText(data.ctaText) }),
      ...(data.ctaUrl !== undefined && { ctaUrl: normalizeBannerText(data.ctaUrl) }),
      // `null` means the current admin form did not provide an image value.
      // Preserve the existing image so text-only edits cannot clear it.
      ...(normalizeBannerImageUrl(data.imageUrl) !== undefined && {
        imageUrl: normalizeBannerImageUrl(data.imageUrl),
      }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder, priority: data.displayOrder }),
      ...(data.slot !== undefined && { slot: data.slot }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(startsAtDate !== undefined && { startsAt: startsAtDate, startDate: startsAtDate ?? new Date() }),
      ...(endsAtDate !== undefined && { endsAt: endsAtDate, endDate: endsAtDate ?? new Date('2099-12-31') }),
    },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNER_UPDATE',
      targetType: 'BANNER',
      targetId: bannerId,
      before: existing ?? undefined,
      after: data,
    },
  })

  revalidateHeroBanners()
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

  revalidateHeroBanners()
}

// ─── 광고 배너 ───

export async function adminCreateAdBanner(data: {
  slot: AdSlot
  adType: AdType
  title?: string
  imageUrl?: string
  htmlCode?: string
  clickUrl?: string
  targetPath?: string
  startDate: string
  endDate: string
  priority?: number
}) {
  const admin = await requireAdmin()

  // 히어로 배너와 같은 규칙으로 클릭 URL을 검증한다(javascript:·//evil.com 등 차단)
  const adCtaError = validateCtaUrlForSave(data.clickUrl)
  if (adCtaError) throw new Error(`클릭 URL: ${adCtaError}`)

  const sanitizedHtmlCode = data.htmlCode ? sanitizeHtmlCode(data.htmlCode) : data.htmlCode

  const ad = await prisma.adBanner.create({
    data: {
      slot: data.slot,
      adType: data.adType,
      title: data.title,
      imageUrl: data.imageUrl,
      htmlCode: sanitizedHtmlCode,
      clickUrl: data.clickUrl,
      targetPath: data.targetPath || null,
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
    slot?: AdSlot
    adType?: AdType
    title?: string
    imageUrl?: string
    htmlCode?: string
    clickUrl?: string
    targetPath?: string
    startDate?: string
    endDate?: string
    priority?: number
    isActive?: boolean
  }
) {
  const admin = await requireAdmin()

  if (data.clickUrl !== undefined) {
    const adCtaError = validateCtaUrlForSave(data.clickUrl)
    if (adCtaError) throw new Error(`클릭 URL: ${adCtaError}`)
  }

  const existing = await prisma.adBanner.findUnique({ where: { id: adId } })

  const sanitizedHtmlCode = data.htmlCode ? sanitizeHtmlCode(data.htmlCode) : data.htmlCode

  await prisma.adBanner.update({
    where: { id: adId },
    data: {
      ...data,
      htmlCode: sanitizedHtmlCode,
      ...(data.targetPath !== undefined && { targetPath: data.targetPath || null }),
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
      before: existing ?? undefined,
      after: data,
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
