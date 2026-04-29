'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import type { BannedWordCategory, Grade } from '@/generated/prisma/client'

async function requireAdmin() {
  const session = await getAdminSession()
  if (!session) throw new Error('관리자 인증이 필요합니다.')
  return session
}

// ─── 금지어 ───

export async function adminCreateBannedWord(word: string, category: BannedWordCategory) {
  const admin = await requireAdmin()

  const entry = await prisma.bannedWord.create({
    data: { word, category },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNED_WORD_CREATE',
      targetType: 'BOARD_CONFIG',
      targetId: entry.id,
      after: { word, category },
    },
  })

  revalidatePath('/admin/settings')
}

export async function adminDeleteBannedWord(wordId: string) {
  const admin = await requireAdmin()

  await prisma.bannedWord.delete({ where: { id: wordId } })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BANNED_WORD_DELETE',
      targetType: 'BOARD_CONFIG',
      targetId: wordId,
    },
  })

  revalidatePath('/admin/settings')
}

export async function adminToggleBannedWord(wordId: string, isActive: boolean) {
  const admin = await requireAdmin()

  await prisma.bannedWord.update({
    where: { id: wordId },
    data: { isActive },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: isActive ? 'BANNED_WORD_ACTIVATE' : 'BANNED_WORD_DEACTIVATE',
      targetType: 'BOARD_CONFIG',
      targetId: wordId,
    },
  })

  revalidatePath('/admin/settings')
}

// ─── 게시판 설정 ───

export async function adminUpdateBoardConfig(
  configId: string,
  data: {
    displayName?: string
    description?: string
    categories?: string[]
    writeGrade?: Grade
    isActive?: boolean
    hotThreshold?: number
    fameThreshold?: number
  }
) {
  const admin = await requireAdmin()

  const existingConfig = await prisma.boardConfig.findUnique({ where: { id: configId } })

  await prisma.boardConfig.update({
    where: { id: configId },
    data,
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'BOARD_CONFIG_UPDATE',
      targetType: 'BOARD_CONFIG',
      targetId: configId,
      before: existingConfig ? JSON.stringify(existingConfig) : undefined,
      after: JSON.parse(JSON.stringify(data)),
    },
  })

  revalidatePath('/admin/settings')
}

// ─── 최상단 띠 배너 설정 ───

function validatePromoHref(href: string) {
  if (!href) return
  if (!href.startsWith('/') && !/^https:\/\//.test(href)) {
    throw new Error('링크는 /로 시작하는 내부 경로 또는 https://로 시작하는 외부 URL만 허용됩니다.')
  }
}

export async function adminUpdateTopPromoBanner(data: {
  type: 'guest' | 'member'
  enabled: boolean
  tag: string
  text: string
  href: string
}) {
  await requireAdmin()
  validatePromoHref(data.href)

  const prefix = data.type === 'guest' ? 'TOP_PROMO_GUEST' : 'TOP_PROMO_MEMBER'

  await prisma.$transaction([
    prisma.setting.upsert({ where: { key: `${prefix}_ENABLED` }, create: { key: `${prefix}_ENABLED`, value: String(data.enabled) }, update: { value: String(data.enabled) } }),
    prisma.setting.upsert({ where: { key: `${prefix}_TAG` },     create: { key: `${prefix}_TAG`,     value: data.tag  }, update: { value: data.tag  } }),
    prisma.setting.upsert({ where: { key: `${prefix}_TEXT` },    create: { key: `${prefix}_TEXT`,    value: data.text }, update: { value: data.text } }),
    prisma.setting.upsert({ where: { key: `${prefix}_HREF` },    create: { key: `${prefix}_HREF`,    value: data.href }, update: { value: data.href } }),
  ])

  const cacheTag = data.type === 'guest' ? 'top-promo-guest' : 'top-promo-member'
  revalidateTag(cacheTag)
  revalidatePath('/', 'layout')
  revalidatePath('/admin/banners')
}
