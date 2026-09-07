import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BaseAgent } from '../core/agent.js'
import { prisma, disconnect } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * COO 에이전트 — 모더레이션
 * AI 필터에 걸린 콘텐츠 2차 판단 + 신고 3회 자동 숨김
 */
class COOModerator extends BaseAgent {
  constructor() {
    super({
      name: 'COO_MODERATE',
      botType: 'COO',
      role: 'COO (운영총괄 — 모더레이션)',
      model: 'light',
      tasks: '콘텐츠 모더레이션: AI 필터 2차 판단, 신고 처리, 자동 숨김',
      canWrite: true,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    let hiddenCount = 0
    let reviewedCount = 0

    // 1. 신고 3회 이상 게시글 자동 숨김
    const reportedPosts = await prisma.post.findMany({
      where: {
        reportCount: { gte: 3 },
        status: 'PUBLISHED',
      },
      select: { id: true, title: true, reportCount: true },
    })

    for (const post of reportedPosts) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: 'HIDDEN' },
      })
      hiddenCount++
    }

    // 2. 신고 3회 이상 댓글 자동 숨김
    const reportedComments = await prisma.comment.findMany({
      where: {
        reportCount: { gte: 3 },
        status: 'ACTIVE',
      },
      select: { id: true, content: true, reportCount: true },
    })

    for (const comment of reportedComments) {
      await prisma.comment.update({
        where: { id: comment.id },
        data: { status: 'HIDDEN' },
      })
      hiddenCount++
    }

    // 3. AI 필터에 걸린 콘텐츠 2차 판단
    const filteredComments = await prisma.comment.findMany({
      where: { isFiltered: true, status: 'ACTIVE' },
      select: { id: true, content: true },
      take: 20,
    })

    for (const comment of filteredComments) {
      const verdict = await this.chat(`
다음 댓글이 우리 커뮤니티 규정에 위반되는지 판단하세요.

금지 항목:
- 정치적 발언/선동
- 종교 갈등 유발
- 혐오 표현 (세대/성별/지역/인종)
- 성인 콘텐츠
- 도박/다단계/불법 광고
- 타인 비방/명예훼손

댓글: <user_content>${comment.content}</user_content>

응답: "HIDE" (위반) 또는 "KEEP" (무해) 한 단어만
`)

      const action = verdict.trim().toUpperCase()
      if (action.includes('HIDE')) {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { status: 'HIDDEN', isFiltered: true },
        })
        hiddenCount++
      } else {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { isFiltered: false },
        })
      }
      reviewedCount++
    }

    const summary = `모더레이션 완료: 숨김 ${hiddenCount}건, AI 리뷰 ${reviewedCount}건`

    if (hiddenCount > 0) {
      await notifyAdmin({
        level: 'important',
        agent: 'COO',
        title: '모더레이션 액션',
        body: `${hiddenCount}건 숨김 처리 (신고 ${reportedPosts.length + reportedComments.length}건 + AI 판단 ${filteredComments.length}건)`,
      })
    }

    return {
      agent: 'COO_MODERATE',
      success: true,
      summary,
      data: { hiddenCount, reviewedCount, reportedPosts: reportedPosts.length, reportedComments: reportedComments.length },
    }
  }
}

const agent = new COOModerator()

/**
 * 모더레이션 1회 실행. **작업이 끝나기 전에는 resolve 하지 않는다.**
 *
 * 예전에는 top-level 에서 `agent.execute().then(...)` 을 시작만 하고 그 Promise 를
 * 아무도 들고 있지 않았다. runner 는 `import()` 가 끝나면 곧바로 disconnect + exit 해서
 * 판정이 중간에 끊겼고, GHA 는 그걸 **success 로 기록**했다 —
 * 로그에 `[Runner] coo:moderator 시작` 만 있고 완료 줄이 없던 이유다.
 *
 * `execute()` 는 run() 이 던진 에러를 삼키고 `success:false` 로 돌려준다.
 * 그대로 두면 실패해도 exit 0 이라 초록불이 되므로 여기서 throw 해서 runner 로 올린다.
 */
export async function main(): Promise<void> {
  const result = await agent.execute()
  if (!result.success) {
    throw new Error(`모더레이션 실패: ${result.error ?? result.summary}`)
  }
  console.log('[COO] 모더레이션:', result.summary)
}

// `tsx coo/moderator.ts` 로 직접 돌릴 때만 실행한다.
// import 만으로 시작하면 runner 가 기다릴 Promise 가 다시 사라진다.
//
// 경로를 정확히 대조한다 — 파일명 부분일치(`includes('moderator')`)로 판정하면
// 경로에 그 단어가 든 다른 진입점에서도 참이 되어 이중 실행이 된다.
const entry = process.argv[1]
const isDirect = entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)
if (isDirect) {
  main()
    .then(() => disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('[COO] 모더레이션 실패:', err instanceof Error ? err.message : String(err))
      await disconnect().catch(() => {})
      process.exit(1)
    })
}
