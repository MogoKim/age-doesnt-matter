import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CPO 에이전트 — 페르소나 다양성 점검 (Weekly)
 * 봇 게시글의 페르소나 빈도, 주제 반복, 스타일 유사성 분석
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

async function main() {
  console.log('[CPO] 페르소나 다양성 점검 시작')
  const start = Date.now()

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // 1. 최근 7일 봇 게시글 조회
    const botPosts = await prisma.post.findMany({
      where: {
        source: 'BOT',
        createdAt: { gte: sevenDaysAgo },
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        title: true,
        content: true,
        boardType: true,
        author: { select: { nickname: true, email: true } },
      },
    })

    if (botPosts.length === 0) {
      const summary = '봇 게시글 없음 (최근 7일)'
      await prisma.botLog.create({
        data: {
          botType: 'CPO',
          action: 'PERSONA_DIVERSITY_CHECK',
          status: 'SUCCESS',
          details: summary,
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      console.log(`[CPO] ${summary}`)
      return
    }

    // 2. 닉네임별 그룹화 + 빈도 계산
    const personaFrequency = new Map<string, number>()
    const personaPosts = new Map<string, Array<{ title: string; content: string; boardType: string }>>()

    for (const post of botPosts) {
      const nickname = post.author.nickname
      personaFrequency.set(nickname, (personaFrequency.get(nickname) ?? 0) + 1)

      const posts = personaPosts.get(nickname) ?? []
      posts.push({ title: post.title, content: post.content.slice(0, 200), boardType: post.boardType })
      personaPosts.set(nickname, posts)
    }

    // 3. 빈도 불균형 분석
    const frequencies = Array.from(personaFrequency.entries())
      .sort((a, b) => b[1] - a[1])

    const totalPosts = botPosts.length
    const uniquePersonas = frequencies.length
    const avgPostsPerPersona = totalPosts / uniquePersonas
    const maxFreq = frequencies[0]?.[1] ?? 0
    const minFreq = frequencies[frequencies.length - 1]?.[1] ?? 0
    const imbalanceRatio = minFreq > 0 ? maxFreq / minFreq : maxFreq

    // 4. AI 다양성 분석
    const topPersonaSamples = frequencies.slice(0, 10).map(([nickname, count]) => {
      const posts = personaPosts.get(nickname) ?? []
      const sampleTitles = posts.slice(0, 3).map(p => p.title).join(', ')
      return `${nickname} (${count}건): ${sampleTitles}`
    }).join('\n')

    const diversityAnalysis = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `다음 봇 페르소나 활동 데이터를 분석하고 다양성을 평가하세요.

총 게시글: ${totalPosts}건
활성 페르소나: ${uniquePersonas}명
평균 게시량: ${avgPostsPerPersona.toFixed(1)}건/페르소나
빈도 불균형: 최다 ${maxFreq}건 vs 최소 ${minFreq}건 (비율 ${imbalanceRatio.toFixed(1)}x)

상위 페르소나:
${topPersonaSamples}

평가 항목:
1. 빈도 균형 (특정 페르소나 편중 여부)
2. 주제 다양성 (비슷한 주제 반복 여부)
3. 스타일 유사성 (글 제목이 비슷한 패턴인지)
4. 개선 제안

JSON으로 응답:
{"balance_score": 0-100, "diversity_score": 0-100, "issues": ["이슈1"], "suggestions": ["제안1"]}`,
      }],
    })

    const analysisText = diversityAnalysis.content[0].type === 'text'
      ? diversityAnalysis.content[0].text
      : '{}'

    // 5. 리포트
    const frequencyReport = frequencies.slice(0, 10)
      .map(([nickname, count]) => `  ${nickname}: ${count}건`)
      .join('\n')

    const body = `*주간 페르소나 다양성 리포트*

총 봇 게시글: ${totalPosts}건
활성 페르소나: ${uniquePersonas}명
빈도 불균형 비율: ${imbalanceRatio.toFixed(1)}x

*상위 10 페르소나:*
${frequencyReport}

*AI 분석:*
${analysisText.slice(0, 800)}`

    await notifySlack({
      level: 'info',
      agent: 'CPO',
      title: '주간 페르소나 다양성 점검',
      body,
    })

    const summary = `페르소나 다양성 점검: ${uniquePersonas}명, ${totalPosts}건, 불균형 ${imbalanceRatio.toFixed(1)}x`

    await prisma.botLog.create({
      data: {
        botType: 'CPO',
        action: 'PERSONA_DIVERSITY_CHECK',
        status: 'SUCCESS',
        details: summary,
        itemCount: totalPosts,
        executionTimeMs: Date.now() - start,
      },
    })

    console.log(`[CPO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CPO] 페르소나 다양성 점검 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'CPO',
        action: 'PERSONA_DIVERSITY_CHECK',
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
