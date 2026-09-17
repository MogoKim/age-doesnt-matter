'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireAdminSession as requireAdmin } from '@/lib/admin-auth'
import { retroactivePromotionUpdate } from '@/lib/actions/promotion'
import type { BannedWordCategory, Grade } from '@/generated/prisma/client'
import { after } from 'next/server'


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
      before: existingConfig ?? undefined,
      after: data,
    },
  })

  // board-config 캐시 즉시 무효화
  updateTag('board-config')
  revalidatePath('/admin/settings')

  // 임계값 변경 시 기존 게시글 즉시 소급 재평가 (비동기, 비블로킹)
  if (data.hotThreshold !== undefined || data.fameThreshold !== undefined) {
    const updated = await prisma.boardConfig.findUnique({ where: { id: configId } })
    if (updated?.boardType) {
      // 🔴 `after()` 로 관리한다. 예전에는 `void fn(...).catch(...)` 였는데,
      //    그 형태는 응답 처리가 끝난 뒤에 `revalidateTag` 를 등록할 수 있고
      //    그렇게 등록된 무효화는 **요청의 캐시 처리에서 빠질 수 있다**(Next 16.3.4 재현).
      //    `after` 는 응답을 보낸 뒤에도 요청 수명 안에서 콜백을 돌려 그 등록을 살린다.
      //    ⚠️ `after(이미시작한Promise)` 나 콜백 안의 `void` 는 같은 문제가 남는다 — 반드시 await 한다.
      // 🔴 **JOB 일 때만** `after()` 로 관리한다.
      //    `void fn(...)` 는 응답 처리가 끝난 뒤 `revalidateTag` 를 등록할 수 있고,
      //    그렇게 등록된 무효화는 요청의 캐시 처리에서 빠질 수 있다(Next 16.3.4 재현).
      //    일자리 캐시 갱신이 걸린 JOB 만 `after` 로 옮기고,
      //    **그 외 게시판은 변경 전 실행 방식과 오류 처리를 그대로 둔다.**
      if (updated.boardType === 'JOB') {
        after(async () => {
          try {
            await retroactivePromotionUpdate(updated.boardType, updated.hotThreshold, updated.fameThreshold)
          } catch (e) {
            console.error('[admin.config] retroactive promote 실패:', e)
          }
        })
      } else {
        void retroactivePromotionUpdate(
          updated.boardType,
          updated.hotThreshold,
          updated.fameThreshold,
        )
      }
    }
  }
}

// ─── 최상단 띠 배너 설정 ───

function validatePromoHref(href: string) {
  if (!href) return
  if (href === 'kakao:share') return // 카카오 공유 액션 sentinel — 클릭 시 카카오톡 공유(TopPromoBannerClient에서 처리)
  if (href === 'kakao:login') return // 카카오 로그인 직접 시작 sentinel — 클릭 시 startKakaoLogin(웹 OAuth / Capacitor handoff, TopPromoBannerClient에서 처리)
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
  updateTag(cacheTag)
  revalidatePath('/', 'layout')
  revalidatePath('/admin/banners')
}
