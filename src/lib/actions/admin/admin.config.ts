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

export async function adminUpdateTopPromoBanner(data: {
  enabled: boolean
  tag: string
  text: string
  href: string
}) {
  await requireAdmin()

  if (data.href && !data.href.startsWith('/') && !/^https?:\/\/age-doesnt-matter\.com/.test(data.href)) {
    throw new Error('링크는 /로 시작하는 내부 경로만 허용됩니다.')
  }

  await prisma.$transaction([
    prisma.setting.upsert({ where: { key: 'TOP_PROMO_ENABLED' }, create: { key: 'TOP_PROMO_ENABLED', value: String(data.enabled) }, update: { value: String(data.enabled) } }),
    prisma.setting.upsert({ where: { key: 'TOP_PROMO_TAG' },     create: { key: 'TOP_PROMO_TAG',     value: data.tag  }, update: { value: data.tag  } }),
    prisma.setting.upsert({ where: { key: 'TOP_PROMO_TEXT' },    create: { key: 'TOP_PROMO_TEXT',    value: data.text }, update: { value: data.text } }),
    prisma.setting.upsert({ where: { key: 'TOP_PROMO_HREF' },    create: { key: 'TOP_PROMO_HREF',    value: data.href }, update: { value: data.href } }),
  ])

  revalidateTag('top-promo-settings')
  revalidatePath('/', 'layout')
  revalidatePath('/admin/banners')
}
