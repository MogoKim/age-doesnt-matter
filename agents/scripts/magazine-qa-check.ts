import { prisma, disconnect } from '../core/db.js'

async function main() {
  const posts = await prisma.$queryRaw<any[]>`
    SELECT id, title, "thumbnailUrl", content, "createdAt"
    FROM "Post"
    WHERE "boardType" = 'MAGAZINE' AND status = 'PUBLISHED'
    ORDER BY "createdAt" DESC
    LIMIT 15
  `

  console.log('\n===== 매거진 QA 재확인 (최근 15건) =====\n')
  posts.forEach((p: any, i: number) => {
    const hasImg = p.content.includes('<img ')
    const hasPlaceholder = /<!-- \[IMAGE:\d+\] -->/.test(p.content)
    const hasRawAiOutput = /제목:|요약:|이미지컨텍스트\d/.test(p.content)
    const hasJsonWrapper = p.content.includes('```json')
    const imgCount = (p.content.match(/<img /g) || []).length
    const issues: string[] = []
    if (!p.thumbnailUrl) issues.push('NO_THUMB')
    if (!hasImg) issues.push('NO_IMG')
    if (hasPlaceholder) issues.push('PLACEHOLDER')
    if (hasRawAiOutput) issues.push('RAW_AI')
    if (hasJsonWrapper) issues.push('JSON_WRAP')
    
    const status = issues.length ? `❌ ${issues.join('|')}` : '✅ OK'
    console.log(`[${String(i+1).padStart(2)}] ${p.title.slice(0,30).padEnd(30)} imgs:${imgCount} ${status}`)
  })
  await disconnect()
}
main().catch(console.error)
