'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
import { checkBannedWords } from '@/lib/banned-words'
import { plainTextToSafeHtml } from '@/lib/sanitize'
import { buildSummary } from '@/lib/summary'
import { generateCommunitySlug } from '@/lib/seo/slug'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'
import {
  needsCommunitySlug,
  validateFounderPersonaInput,
  type FounderPersonaInput,
} from '@/lib/founder-personas'

/**
 * 창업자 페르소나 발행 — 어드민에서 직접 쓴 글을 지정 페르소나 계정 이름으로 즉시 발행한다.
 *
 * 범위 (창업자 판정 2026-09-10):
 *  - **최종 '발행'을 눌렀을 때만 DB write.** 미리보기 단계에는 저장이 없다(폼 로컬 렌더).
 *  - 상태는 PUBLISHED 고정. DRAFT·예약 발행은 이번 범위 밖이다.
 *  - 페르소나 계정이 없거나 ACTIVE가 아니면 발행하지 않는다. **계정 자동 생성 금지.**
 *  - AI 초안 생성 없음 — 제목·본문은 창업자가 직접 입력한 값 그대로다.
 *
 * source='ADMIN'인 이유: 글을 실제로 쓴 주체가 창업자(어드민)라서다. 자동 생성분이 아니므로
 * BOT(수집·생성분)으로 두지 않는다. 이 값은 community-google-noindex의 HUMAN_SOURCES 판정에
 * 들어간다 — 일반 `<meta name="robots">`는 이 경로와 무관하게 `index, follow`로 유지된다.
 *
 * category는 두지 않는다(항상 null). '가입인사'(회원 전용)·'이벤트'(공식 이벤트 전용) 같은
 * 예약 카테고리 오염 경로를 아예 만들지 않기 위해서다.
 */
export type PublishAsFounderPersonaResult =
  | { error: string }
  | { postId: string; postUrl: string; authorNickname: string }

export async function publishAsFounderPersona(
  input: FounderPersonaInput,
): Promise<PublishAsFounderPersonaResult> {
  const admin = await getAdminSession()
  if (!admin) return { error: '관리자 인증이 필요합니다.' }

  const validated = validateFounderPersonaInput(input)
  if ('error' in validated) return validated
  const { persona, boardType, title, content } = validated.ok

  // 작성자 계정 확정 — 카탈로그의 accountEmail로 조회한다(자동 생성하지 않는다).
  const account = await prisma.user.findUnique({
    where: { email: persona.accountEmail },
    select: { id: true, nickname: true, email: true, status: true },
  })
  if (!account) {
    return {
      error: `'${persona.displayName}' 계정(${persona.accountEmail})이 DB에 없습니다. 계정을 먼저 만들어 주세요.`,
    }
  }
  if (account.status !== 'ACTIVE') {
    return { error: `'${persona.displayName}' 계정이 ACTIVE 상태가 아닙니다 (${account.status}).` }
  }
  // 카탈로그가 잘못 수정돼도 실계정으로는 발행되지 않게 하는 2차 방어선
  if (!account.email?.endsWith('@unao.bot')) {
    return { error: '페르소나 계정이 아닌 사용자로는 발행할 수 없습니다.' }
  }

  const [bannedInTitle, bannedInContent, boardConfig] = await Promise.all([
    checkBannedWords(title),
    checkBannedWords(content),
    prisma.boardConfig.findUnique({ where: { boardType } }),
  ])
  if (bannedInTitle) return { error: '제목에 사용할 수 없는 표현이 포함되어 있습니다.' }
  if (bannedInContent) return { error: '본문에 사용할 수 없는 표현이 포함되어 있습니다.' }
  if (!boardConfig?.isActive) return { error: '현재 글을 작성할 수 없는 게시판입니다.' }

  // 평문 입력 → 이스케이프 + <p> 분할 + 새니타이즈. 폼 미리보기(whitespace-pre-wrap)와 같은 결과.
  const safeContent = plainTextToSafeHtml(content)
  const slug = needsCommunitySlug(boardType) ? await generateCommunitySlug(title) : null

  // postCount는 증가시키지 않는다 — api/bot/posts(페르소나 계정 발행 경로)와 동일하게 맞춘다.
  const post = await prisma.post.create({
    data: {
      boardType,
      category: null,
      title,
      content: safeContent,
      summary: buildSummary(safeContent),
      authorId: account.id,
      source: 'ADMIN',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      slug,
    },
    select: { id: true },
  })

  await prisma.adminAuditLog.create({
    data: {
      adminId: admin.adminId,
      action: 'FOUNDER_PERSONA_PUBLISH',
      targetType: 'POST',
      targetId: post.id,
      after: {
        personaId: persona.id,
        accountEmail: persona.accountEmail,
        boardType,
        title,
      },
      note: `${persona.displayName} 페르소나로 발행`,
    },
  })

  const boardPath = BOARD_URL_PREFIX[boardType]
  revalidatePath(boardPath)
  revalidatePath('/')
  updateTag('home-trending')
  updateTag('home-stories')
  updateTag('home-humor')
  updateTag('community-board-page')
  revalidatePath('/admin/content')

  return {
    postId: post.id,
    postUrl: `${boardPath}/${slug ?? post.id}`,
    authorNickname: account.nickname,
  }
}
