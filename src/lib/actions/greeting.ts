'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkBannedWords } from '@/lib/banned-words'
import { sanitizeHtml, stripHtmlTags } from '@/lib/sanitize'
import { generateCommunitySlug } from '@/lib/seo/slug'
import { checkAndPromote } from '@/lib/grade'
import { enqueueUserPostWave } from '@/lib/actions/wave-queue'
import { getWriteBlockReason } from '@/lib/sanctions'
import { GREETING_CATEGORY } from '@/lib/greeting'

interface SubmitGreetingResult {
  error?: string
  postUrl?: string
}

const MIN_LEN = 5
const MAX_LEN = 200

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 첫 가입인사 작성 — 홈 첫인사 위젯 전용 경량 액션.
 *  - STORY / category='가입인사' / source=USER 고정(회원만, 가드는 assertGreetingByMember와 동일 정책)
 *  - User.firstGreetingAt/firstGreetingPostId 최초 1회 기록(동시요청은 updateMany count로 가드)
 *  - 기존 봇 환대 wave(enqueueUserPostWave) 유지
 */
export async function submitGreeting(message: string): Promise<SubmitGreetingResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }
  const userId = session.user.id

  // 제재(정지/차단) 유저 차단 — createPost와 동일 정책
  const blockReason = await getWriteBlockReason(userId)
  if (blockReason) {
    return { error: blockReason }
  }

  const text = message?.trim()
  if (!text || text.length < MIN_LEN) {
    return { error: `인사말을 ${MIN_LEN}자 이상 입력해 주세요` }
  }
  if (text.length > MAX_LEN) {
    return { error: `인사말은 ${MAX_LEN}자 이내로 입력해 주세요` }
  }

  const banned = await checkBannedWords(text)
  if (banned) {
    return { error: '사용할 수 없는 표현이 포함되어 있습니다' }
  }

  // 이미 첫 인사를 남긴 회원은 중복 차단(위젯도 숨기지만 서버에서 한 번 더 방어)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstGreetingAt: true, nickname: true },
  })
  if (!user) {
    return { error: '회원 정보를 찾을 수 없습니다' }
  }
  if (user.firstGreetingAt) {
    return { error: '이미 첫 인사를 남기셨어요' }
  }

  const title = `${user.nickname}님의 첫인사`
  // 한 줄 평문 → escape 후 <p>로 감싸고 sanitize(허용 태그만 통과)
  const safeContent = sanitizeHtml(`<p>${escapeHtml(text)}</p>`)
  const plain = stripHtmlTags(safeContent)
  const summary = plain.length > 100 ? plain.slice(0, 97) + '...' : plain
  const slug = await generateCommunitySlug(title)

  try {
    const post = await prisma.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          boardType: 'STORY',
          category: GREETING_CATEGORY,
          title,
          content: safeContent,
          summary,
          authorId: userId,
          source: 'USER',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          slug,
        },
      })
      // 최초 1회만 기록 — firstGreetingAt가 아직 null인 경우에만(동시 제출 가드)
      const updated = await tx.user.updateMany({
        where: { id: userId, firstGreetingAt: null },
        data: {
          firstGreetingAt: new Date(),
          firstGreetingPostId: newPost.id,
          postCount: { increment: 1 },
        },
      })
      if (updated.count === 0) {
        // 동시 요청이 먼저 기록함 → 이 트랜잭션 전체 롤백(글 생성도 취소)
        throw new Error('ALREADY_GREETED')
      }
      return newPost
    })

    void checkAndPromote(userId).catch(() => {})
    void enqueueUserPostWave(post.id, userId).catch(() => {})
    revalidateTag('community-board-page')
    revalidatePath('/community/stories')
    return { postUrl: `/community/stories/${post.slug ?? post.id}` }
  } catch (e) {
    if (e instanceof Error && e.message === 'ALREADY_GREETED') {
      return { error: '이미 첫 인사를 남기셨어요' }
    }
    throw e
  }
}
