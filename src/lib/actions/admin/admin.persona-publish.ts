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
  FOUNDER_PERSONA_DUPLICATE_WINDOW_MS,
  needsCommunitySlug,
  normalizeFounderPersonaTitle,
  validateFounderPersonaInput,
  type FounderPersonaBoardType,
  type FounderPersonaInput,
} from '@/lib/founder-personas'

/**
 * 창업자 페르소나 발행 — 창업자가 직접 쓴 글을 **이미 존재하는** 페르소나 봇 계정 이름으로 발행한다.
 *
 * ## 작성 주체(provenance)와 표시 작성자는 다르다
 *
 * 원문을 쓴 사람은 **창업자(어드민)**다. `source='ADMIN'`이 그 사실을 기록한다 —
 * 자동 생성분(`source='BOT'`)이 아니라는 뜻이고, community-google-noindex의
 * `HUMAN_SOURCES` 판정에도 그렇게 들어간다. 일반 `<meta name="robots">`는 이 경로와 무관하게
 * `index, follow`로 유지되며 sitemap·canonical도 건드리지 않는다.
 *
 * **화면에 보이는 작성자(`authorId`)만** 기존 페르소나 계정이다. 두 값이 다르다는 사실은
 * 감사 로그(`AdminAuditLog.after.authoredByAdminId` / `displayedAsUserId`)에 매번 남긴다.
 *
 * ## 범위 (창업자 판정)
 *  - 후보는 제거된 persona registry에서 `canWritePost=true`였던 289종뿐이다.
 *    `founder-*` 같은 신규 계정도, `official@unao.bot`도 쓰지 않는다.
 *  - **계정 생성 금지.** DB에 없거나 ACTIVE가 아니면 발행하지 않는다(`user.create`/`upsert` 없음).
 *  - 최종 '발행'에서만 DB write. 미리보기 단계에는 서버 호출조차 없다.
 *  - 상태는 PUBLISHED 고정. DRAFT·예약 발행은 범위 밖이다.
 *  - AI 초안 생성 없음. 제목·본문은 창업자 입력 그대로다.
 *
 * category는 두지 않는다(항상 null). '가입인사'(회원 전용)·'이벤트'(공식 이벤트 전용) 같은
 * 예약 카테고리 오염 경로를 아예 만들지 않기 위해서다.
 */
export type PublishAsFounderPersonaResult =
  | { error: string }
  | { duplicate: true; postId: string; postUrl: string; authorNickname: string }
  | { duplicate: false; postId: string; postUrl: string; authorNickname: string }

/** Prisma 직렬화 충돌/교착 — Serializable 트랜잭션에서 동시 요청이 부딪히면 난다 */
function isSerializationFailure(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  return code === 'P2034'
}

interface TxOutcome {
  postId: string
  slug: string | null
  duplicate: boolean
}

export async function publishAsFounderPersona(
  input: FounderPersonaInput,
): Promise<PublishAsFounderPersonaResult> {
  const admin = await getAdminSession()
  if (!admin) return { error: '관리자 인증이 필요합니다.' }

  const validated = validateFounderPersonaInput(input)
  if ('error' in validated) return validated
  const { candidate, boardType, title, content } = validated.ok

  // 작성자 계정 확정 — 후보 카탈로그의 email로 조회만 한다. 없으면 그대로 실패시킨다.
  const account = await prisma.user.findUnique({
    where: { email: candidate.email },
    select: { id: true, nickname: true, email: true, status: true },
  })
  if (!account) {
    return {
      error: `페르소나 계정(${candidate.email})이 DB에 없습니다. 이 화면은 계정을 만들지 않습니다.`,
    }
  }
  if (account.status !== 'ACTIVE') {
    return { error: `페르소나 계정이 ACTIVE 상태가 아닙니다 (${account.status}).` }
  }
  // 카탈로그가 잘못 수정돼도 실회원 계정으로는 발행되지 않게 하는 2차 방어선
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
  // slug 생성은 트랜잭션 밖에서 미리 끝낸다 — 트랜잭션 구간을 짧게 유지(Serializable 충돌 최소화).
  const slug = needsCommunitySlug(boardType) ? await generateCommunitySlug(title) : null

  let outcome: TxOutcome
  try {
    outcome = await runPublishTransaction({
      authorId: account.id,
      adminId: admin.adminId,
      personaEmail: candidate.email,
      boardType,
      title,
      safeContent,
      slug,
    })
  } catch (e) {
    if (isSerializationFailure(e)) {
      // 동시에 들어온 같은 요청과 부딪혔다. 한 번만 재시도하면 이번엔 중복 검사에서 걸린다.
      try {
        outcome = await runPublishTransaction({
          authorId: account.id,
          adminId: admin.adminId,
          personaEmail: candidate.email,
          boardType,
          title,
          safeContent,
          slug,
        })
      } catch {
        return { error: '동시에 같은 요청이 들어와 발행하지 못했습니다. 잠시 후 다시 시도해 주세요.' }
      }
    } else {
      throw e
    }
  }

  const boardPath = BOARD_URL_PREFIX[boardType]
  const postUrl = `${boardPath}/${outcome.slug ?? outcome.postId}`

  // 중복이면 새 글이 없으므로 캐시를 흔들 이유도 없다.
  if (!outcome.duplicate) {
    revalidatePath(boardPath)
    revalidatePath('/')
    updateTag('home-trending')
    updateTag('home-stories')
    updateTag('home-humor')
    updateTag('community-board-page')
    revalidatePath('/admin/content')
  }

  return {
    duplicate: outcome.duplicate,
    postId: outcome.postId,
    postUrl,
    authorNickname: account.nickname,
  }
}

interface PublishTxArgs {
  authorId: string
  adminId: string
  personaEmail: string
  boardType: FounderPersonaBoardType
  title: string
  safeContent: string
  slug: string | null
}

/**
 * 발행 트랜잭션 — 중복 검사 + Post 생성 + postCount 증가 + 감사 로그를 **하나로** 묶는다.
 *
 * 셋 중 하나라도 실패하면 전부 롤백된다. 특히 감사 로그가 실패했는데 글만 남는 상태를
 * 만들지 않는다 — 누가 어느 페르소나 이름으로 썼는지 추적할 수 없는 글은 남기지 않는다.
 *
 * isolationLevel Serializable: 중복 검사(SELECT)와 INSERT 사이에 다른 요청이 끼어들어
 * 같은 글이 두 번 들어가는 걸 DB가 막는다. 부딪히면 P2034로 실패하고 호출부가 1회 재시도한다.
 *
 * 중복 판정 키: authorId + boardType + 정규화 title + safeContent 완전 일치, 최근 10분 이내.
 * 정규화 title은 DB에 없는 값이라 where로 못 건다 — 같은 작성자·게시판의 최근 글만
 * 좁게 뽑아(`@@index([authorId])`) 메모리에서 비교한다.
 */
async function runPublishTransaction(args: PublishTxArgs): Promise<TxOutcome> {
  const { authorId, adminId, personaEmail, boardType, title, safeContent, slug } = args
  const normalizedTitle = normalizeFounderPersonaTitle(title)

  return prisma.$transaction(
    async (tx) => {
      const since = new Date(Date.now() - FOUNDER_PERSONA_DUPLICATE_WINDOW_MS)
      const recent = await tx.post.findMany({
        where: {
          authorId,
          boardType,
          status: { not: 'DELETED' },
          createdAt: { gte: since },
        },
        select: { id: true, title: true, content: true, slug: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })

      const dup = recent.find(
        (p) =>
          normalizeFounderPersonaTitle(p.title) === normalizedTitle && p.content === safeContent,
      )
      if (dup) {
        return { postId: dup.id, slug: dup.slug, duplicate: true }
      }

      const created = await tx.post.create({
        data: {
          boardType,
          category: null,
          title,
          content: safeContent,
          summary: buildSummary(safeContent),
          authorId,
          source: 'ADMIN',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          slug,
        },
        select: { id: true },
      })

      await tx.user.update({
        where: { id: authorId },
        data: { postCount: { increment: 1 } },
      })

      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: 'FOUNDER_PERSONA_PUBLISH',
          targetType: 'POST',
          targetId: created.id,
          after: {
            // 원문을 쓴 주체(창업자)와 화면에 보이는 작성자(페르소나 계정)를 분리해 남긴다.
            authoredByAdminId: adminId,
            displayedAsUserId: authorId,
            displayedAsEmail: personaEmail,
            source: 'ADMIN',
            boardType,
            title,
          },
          note: `창업자 직접 작성 · 표시 작성자 ${personaEmail} (source=ADMIN — 원문 작성자는 어드민, authorId만 페르소나 계정)`,
        },
      })

      return { postId: created.id, slug, duplicate: false }
    },
    { isolationLevel: 'Serializable', timeout: 15_000 },
  )
}
