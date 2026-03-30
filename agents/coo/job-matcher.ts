import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'

/**
 * COO 에이전트 — 일자리-프로필 매칭
 * P4 순자씨 타겟: JOB 게시글과 구직 관심 유저를 연결
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

/** 일자리 관련 키워드 */
const JOB_KEYWORDS = ['일자리', '취업', '구직', '알바', '파트타임', '재취업', '채용', '구인']

async function main() {
  console.log('[COO] 일자리 매칭 시작')
  const start = Date.now()
  let matchCount = 0

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // 1. 최근 24시간 JOB 게시글 조회
    const jobPosts = await prisma.post.findMany({
      where: {
        boardType: 'JOB',
        status: 'PUBLISHED',
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { id: true, title: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    if (jobPosts.length === 0) {
      console.log('[COO] 매칭할 일자리 게시글 없음')
      await prisma.botLog.create({
        data: {
          botType: 'COO',
          action: 'JOB_MATCH',
          status: 'SUCCESS',
          details: 'JOB 게시글 없음',
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      return
    }

    // 2. AI로 일자리 카테고리화
    const jobSummaries = jobPosts.map(j => `[${j.id}] ${j.title}: ${j.content.slice(0, 100)}`).join('\n')

    const categorizeResult = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `다음 일자리 게시글들을 분류해주세요. 각 게시글에 대해 나이요건/지역/유형을 JSON 배열로 응답하세요.

${jobSummaries}

응답 형식 (JSON만, 설명 없이):
[{"id":"...", "age":"50대 가능", "location":"서울", "type":"사무직"}]`,
      }],
    })

    const categorizeText = categorizeResult.content[0].type === 'text' ? categorizeResult.content[0].text : '[]'

    // 3. STORY 보드에서 일자리 관심 게시글 찾기
    const storyPosts = await prisma.post.findMany({
      where: {
        boardType: 'STORY',
        status: 'PUBLISHED',
        createdAt: { gte: twentyFourHoursAgo },
        OR: JOB_KEYWORDS.map(keyword => ({
          content: { contains: keyword },
        })),
      },
      select: {
        id: true,
        title: true,
        content: true,
        authorId: true,
        commentCount: true,
      },
      take: 10,
    })

    if (storyPosts.length === 0) {
      console.log('[COO] 구직 관련 STORY 게시글 없음')
      await prisma.botLog.create({
        data: {
          botType: 'COO',
          action: 'JOB_MATCH',
          status: 'SUCCESS',
          details: `JOB ${jobPosts.length}건 수집, 구직 STORY 0건`,
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      return
    }

    // 4. 매칭 댓글 생성 (AS 또는 D 페르소나 사용)
    const jobPersonas = ['AS', 'D']

    for (const story of storyPosts) {
      try {
        const personaId = jobPersonas[Math.floor(Math.random() * jobPersonas.length)]
        const botUserId = await getBotUser(personaId)

        if (botUserId === story.authorId) continue

        // 이미 봇 댓글 있는지 체크
        const existing = await prisma.comment.findFirst({
          where: { postId: story.id, authorId: botUserId },
        })
        if (existing) continue

        // 관련 일자리 추천 댓글 생성
        const relevantJobs = jobPosts.slice(0, 3).map(j => `"${j.title}"`).join(', ')

        const commentResult = await client.messages.create({
          model: MODEL,
          max_tokens: 300,
          system: `당신은 50-60대 커뮤니티 회원입니다. 따뜻하고 도움이 되는 톤으로 일자리 정보를 공유하세요.
규칙:
- "시니어" 용어 절대 금지
- 자연스러운 구어체
- 마크다운 문법 금지`,
          messages: [{
            role: 'user',
            content: `이 글에 맞춤 일자리 추천 댓글을 작성하세요.

글 제목: ${story.title}
글 내용: ${story.content.slice(0, 200)}

추천할 일자리: ${relevantJobs}
일자리 카테고리 정보: ${categorizeText.slice(0, 500)}

2-3문장으로 따뜻하게 일자리 정보를 알려주세요. "일자리 게시판에 ~ 글이 있더라고요" 같은 자연스러운 톤으로.`,
          }],
        })

        const commentText = commentResult.content[0].type === 'text'
          ? commentResult.content[0].text.trim()
          : ''

        if (!commentText) continue

        await prisma.comment.create({
          data: {
            postId: story.id,
            authorId: botUserId,
            content: commentText,
            status: 'ACTIVE',
          },
        })

        await prisma.post.update({
          where: { id: story.id },
          data: { commentCount: { increment: 1 } },
        })

        matchCount++
        console.log(`[COO] 일자리 매칭: "${story.title}" ← ${personaId}`)
      } catch (err) {
        console.error(`[COO] 일자리 매칭 댓글 실패 (post ${story.id}):`, err)
      }
    }

    const summary = `일자리 매칭 완료: JOB ${jobPosts.length}건 수집, STORY ${storyPosts.length}건 대상, ${matchCount}건 매칭`

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        action: 'JOB_MATCH',
        status: 'SUCCESS',
        details: summary,
        itemCount: matchCount,
        executionTimeMs: Date.now() - start,
      },
    })

    if (matchCount > 0) {
      await notifySlack({
        level: 'info',
        agent: 'COO',
        title: '일자리 매칭',
        body: summary,
      })
    }

    console.log(`[COO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[COO] 일자리 매칭 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        action: 'JOB_MATCH',
        status: 'FAILED',
        details: errorMsg,
        itemCount: 0,
        executionTimeMs: Date.now() - start,
      },
    })
  } finally {
    await disconnect()
  }
}

main()
