/**
 * QA 에이전트 — 콘텐츠 품질 감사 (content-audit)
 *
 * 매일 08:20 KST 자동 실행: 최근 24시간 발행된 MAGAZINE 게시글 품질 검사
 * 오늘 수동으로 하던 QA 작업을 자동화한 에이전트
 *
 * 검사 항목:
 * 1. 이미지 없음 (thumbnailUrl null OR <img> 0개)
 * 2. JSON-wrapped content (```json 포함)
 * 3. placeholder 텍스트 ('이미지를 넣어주세요' 등)
 * 4. raw AI output ('As an AI', '죄송합니다' 등)
 *
 * 자동 수정:
 * - JSON unwrap → 즉시 수정 후 info 알림
 * - 이미지 없음 → generateMagazineImageByContext 호출 후 삽입
 *
 * 자동 수정 불가 → Slack #qa 알림 + 내용 요약
 *
 * CTO 에이전트가 지휘, QA 에이전트가 실행하고 보고하는 구조
 */

import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { generateMagazineImageByContext } from '../cafe/image-generator.js'
import { getDefaultImagePlan } from '../core/image-prompt-builder.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostRow {
  id: string
  title: string
  content: string
  thumbnailUrl: string | null
  createdAt: Date
}

interface IssueResult {
  id: string
  title: string
  issues: string[]
  fixed: string[]
  needsManual: string[]
}

// ---------------------------------------------------------------------------
// 검사 헬퍼
// ---------------------------------------------------------------------------

function countImgTags(html: string): number {
  return (html.match(/<img\s/gi) ?? []).length
}

function detectIssues(post: PostRow): string[] {
  const issues: string[] = []

  // 1. 이미지 없음
  if (!post.thumbnailUrl || countImgTags(post.content) === 0) {
    issues.push('NO_IMAGE')
  }

  // 2. JSON-wrapped content
  if (post.content.includes('```json') || post.content.includes('```\n{')) {
    issues.push('JSON_WRAPPED')
  }

  // 3. placeholder 텍스트
  const PLACEHOLDER_PATTERNS = [
    '이미지를 넣어주세요',
    '설명을 추가해주세요',
    '[이미지]',
    '[사진]',
    'IMAGE_PLACEHOLDER',
  ]
  if (PLACEHOLDER_PATTERNS.some((p) => post.content.includes(p))) {
    issues.push('PLACEHOLDER')
  }

  // 4. raw AI output
  const AI_OUTPUT_PATTERNS = [
    'As an AI',
    'I cannot',
    '죄송합니다, 저는',
    '저는 AI',
    'language model',
  ]
  if (AI_OUTPUT_PATTERNS.some((p) => post.content.includes(p))) {
    issues.push('RAW_AI_OUTPUT')
  }

  return issues
}

// ---------------------------------------------------------------------------
// 자동 수정: JSON-wrapped content 복구
// ---------------------------------------------------------------------------

async function fixJsonWrapped(id: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ content: string; title: string }[]>`
    SELECT content, title FROM "Post" WHERE id = ${id}
  `
  if (!rows[0]) return false

  const raw = rows[0].content
  const contentMatch = raw.match(/"content"\s*:\s*"([\s\S]+?)(?="(?:,|\s*\})|\s*$)/)
  const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/)

  if (!contentMatch) {
    // 추출 불가 → DRAFT로 전환
    await prisma.$executeRaw`UPDATE "Post" SET status = 'DRAFT' WHERE id = ${id}`
    console.warn(`[QA] ${id} JSON 추출 실패 → DRAFT 전환`)
    return false
  }

  const cleanContent = contentMatch[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/<\/li<\/p>/g, '</li></ul></p>')
    .trim()

  const newTitle = titleMatch ? titleMatch[1] : rows[0].title
  await prisma.$executeRaw`UPDATE "Post" SET title = ${newTitle}, content = ${cleanContent} WHERE id = ${id}`
  console.log(`[QA] ${id} JSON unwrap 완료`)
  return true
}

// ---------------------------------------------------------------------------
// 자동 수정: 이미지 삽입
// ---------------------------------------------------------------------------

async function insertImages(id: string, title: string, category: string): Promise<boolean> {
  try {
    const [ctx1, ctx2] = getDefaultImagePlan(category)

    const heroImg = await generateMagazineImageByContext(ctx1)
    if (!heroImg) {
      console.warn(`[QA] ${id} 히어로 이미지 생성 실패`)
      return false
    }

    const bodyImg = await generateMagazineImageByContext(ctx2)

    const rows = await prisma.$queryRaw<{ content: string }[]>`
      SELECT content FROM "Post" WHERE id = ${id}
    `
    let content = rows[0]?.content ?? ''

    const heroTag = `<img src="${heroImg.url}" alt="${title} 관련 이미지" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`
    const h2h3Match = content.match(/<h[23]/)
    if (h2h3Match?.index !== undefined) {
      content = content.slice(0, h2h3Match.index) + heroTag + '\n\n' + content.slice(h2h3Match.index)
    } else {
      content = heroTag + '\n\n' + content
    }

    if (bodyImg) {
      const bodyTag = `<img src="${bodyImg.url}" alt="${title} 생활 이미지" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`
      const allH = [...content.matchAll(/<h[23]/g)]
      if (allH.length >= 2 && allH[1].index !== undefined) {
        content = content.slice(0, allH[1].index) + bodyTag + '\n\n' + content.slice(allH[1].index)
      } else {
        content = content + '\n\n' + bodyTag
      }
    }

    const thumbnailUrl = heroImg.url

    await prisma.$executeRaw`
      UPDATE "Post" SET content = ${content}, "thumbnailUrl" = ${thumbnailUrl}
      WHERE id = ${id}
    `
    console.log(`[QA] ${id} 이미지 삽입 완료 (hero: ${heroImg.source})`)
    return true
  } catch (err) {
    console.error(`[QA] ${id} 이미지 삽입 실패:`, err)
    return false
  }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main() {
  console.log('[QA] 콘텐츠 감사 시작')
  const start = Date.now()

  try {
    // 최근 24시간 발행 MAGAZINE 게시글 조회
    const posts = await prisma.$queryRaw<PostRow[]>`
      SELECT id, title, content, "thumbnailUrl", "createdAt"
      FROM "Post"
      WHERE "boardType" = 'MAGAZINE'
        AND status = 'PUBLISHED'
        AND "createdAt" >= NOW() - INTERVAL '24 hours'
      ORDER BY "createdAt" DESC
      LIMIT 20
    `

    if (posts.length === 0) {
      console.log('[QA] 최근 24시간 발행 게시글 없음')
      await prisma.botLog.create({
        data: {
          botType: 'QA',
          action: 'CONTENT_AUDIT',
          status: 'SUCCESS',
          details: '최근 24시간 발행 게시글 없음',
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      return
    }

    console.log(`[QA] ${posts.length}건 검사 시작`)
    const results: IssueResult[] = []

    for (const post of posts) {
      const issues = detectIssues(post)
      if (issues.length === 0) continue

      const result: IssueResult = {
        id: post.id,
        title: post.title,
        issues,
        fixed: [],
        needsManual: [],
      }

      console.log(`[QA] ${post.id} "${post.title.slice(0, 30)}" → 문제: ${issues.join(', ')}`)

      // 자동 수정 시도
      for (const issue of issues) {
        if (issue === 'JSON_WRAPPED') {
          const ok = await fixJsonWrapped(post.id)
          if (ok) result.fixed.push('JSON_WRAPPED')
          else result.needsManual.push('JSON_WRAPPED(추출실패→DRAFT)')
        } else if (issue === 'NO_IMAGE') {
          // 카테고리 추출 (title 또는 기본값)
          const category = 'WELLNESS' // 기본 카테고리
          const ok = await insertImages(post.id, post.title, category)
          if (ok) result.fixed.push('NO_IMAGE')
          else result.needsManual.push('NO_IMAGE(이미지생성실패)')
        } else {
          result.needsManual.push(issue)
        }
      }

      results.push(result)
    }

    // 결과 집계
    const totalProblems = results.length
    const totalFixed = results.filter((r) => r.fixed.length > 0 && r.needsManual.length === 0).length
    const needsAttention = results.filter((r) => r.needsManual.length > 0)

    const summary = `QA 감사 완료: ${posts.length}건 검사, ${totalProblems}건 문제 발견, ${totalFixed}건 자동 수정, ${needsAttention.length}건 수동 확인 필요`
    console.log(`[QA] ${summary}`)

    // 문제 없으면 info 알림
    if (totalProblems === 0) {
      await notifySlack({
        level: 'info',
        agent: 'CTO',
        title: 'QA 콘텐츠 감사 ✅ 정상',
        body: `${posts.length}건 검사 완료 — 품질 이상 없음`,
      })
    } else if (needsAttention.length > 0) {
      // 수동 확인 필요 → Slack #qa 알림
      const attentionList = needsAttention
        .map((r) => `• "${r.title.slice(0, 30)}" → ${r.needsManual.join(', ')}`)
        .join('\n')

      const body = [
        `*검사*: ${posts.length}건 | *문제*: ${totalProblems}건 | *자동수정*: ${totalFixed}건`,
        '',
        `*수동 확인 필요 (${needsAttention.length}건):*`,
        attentionList,
      ].join('\n')

      await notifySlack({
        level: 'important',
        agent: 'CTO',
        title: `QA 콘텐츠 감사 ⚠️ ${needsAttention.length}건 수동 확인 필요`,
        body,
      })
    } else {
      // 전부 자동 수정 성공
      await notifySlack({
        level: 'info',
        agent: 'CTO',
        title: `QA 콘텐츠 감사 🔧 ${totalFixed}건 자동 수정 완료`,
        body: `${posts.length}건 검사, ${totalProblems}건 문제 발견 → ${totalFixed}건 자동 수정`,
      })
    }

    await prisma.botLog.create({
      data: {
        botType: 'QA',
        action: 'CONTENT_AUDIT',
        status: needsAttention.length > 0 ? 'PARTIAL' : 'SUCCESS',
        details: summary,
        itemCount: posts.length,
        executionTimeMs: Date.now() - start,
      },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[QA] 콘텐츠 감사 실패:', errorMsg)

    await notifySlack({
      level: 'important',
      agent: 'CTO',
      title: 'QA 콘텐츠 감사 실패',
      body: errorMsg,
    })

    await prisma.botLog.create({
      data: {
        botType: 'QA',
        action: 'CONTENT_AUDIT',
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
