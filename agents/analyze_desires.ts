/**
 * 우나어 5060 고객 욕망/니즈/원츠 분석 스크립트
 * B방법: CafeTrend(AI 분석 완료본) + A방법: CafePost(원문) 병행
 */
import { prisma } from './core/db.js'

// ── 타입 정의 ──────────────────────────────────────────
interface HotTopic { topic: string; count: number; sentiment: string; examples?: string[] }
interface Keyword { word: string; frequency: number }
interface SentimentMap { positive: number; neutral: number; negative: number }
interface PersonaHint { type: string; description: string; examplePosts?: string[] }

async function main() {
  console.log('\n🔍 ====== [우나어] 5060 고객 욕망 분석 시작 ======\n')

  // ══════════════════════════════════════════════════════════
  // 0단계: 데이터 현황 파악
  // ══════════════════════════════════════════════════════════
  const totalPosts    = await prisma.cafePost.count()
  const usablePosts   = await prisma.cafePost.count({ where: { isUsable: true } })
  const totalTrends   = await prisma.cafeTrend.count()

  // 카페별 수집 현황
  const byCafe = await prisma.cafePost.groupBy({
    by: ['cafeId', 'cafeName'],
    _count: { id: true },
    _avg: { qualityScore: true, likeCount: true, commentCount: true },
  })

  // 게시판 카테고리별 현황
  const byCategory = await prisma.cafePost.groupBy({
    by: ['boardCategory'],
    _count: { id: true },
    _avg: { likeCount: true, commentCount: true },
    orderBy: { _count: { id: 'desc' } },
  })

  console.log('📊 [0단계] 데이터 현황')
  console.log(`  - 총 수집 카페 게시글: ${totalPosts.toLocaleString()}건`)
  console.log(`  - 분석 활용 가능 글(isUsable): ${usablePosts.toLocaleString()}건`)
  console.log(`  - 누적 AI 트렌드 리포트: ${totalTrends}일 치`)
  console.log('\n  [카페별 현황]')
  for (const c of byCafe) {
    console.log(`  · ${c.cafeName} (${c.cafeId}): ${c._count.id}건 | 평균 품질점수: ${c._avg.qualityScore?.toFixed(1)} | 평균 좋아요: ${c._avg.likeCount?.toFixed(1)}`)
  }
  console.log('\n  [게시판 카테고리별 현황]')
  for (const b of byCategory) {
    const cat = b.boardCategory ?? '미분류'
    console.log(`  · ${cat}: ${b._count.id}건 | 평균 좋아요: ${b._avg.likeCount?.toFixed(1)} | 평균 댓글: ${b._avg.commentCount?.toFixed(1)}`)
  }

  // ══════════════════════════════════════════════════════════
  // 1단계: 정량 분석 — 반응 지수 TOP 30 (좋아요 + 댓글×2)
  // ══════════════════════════════════════════════════════════
  console.log('\n🔥 [1단계] 반응 폭발 TOP 30 게시글')
  const hotPosts = await prisma.cafePost.findMany({
    where: { isUsable: true },
    select: {
      title: true, cafeName: true, boardCategory: true, boardName: true,
      likeCount: true, commentCount: true, viewCount: true,
      sentiment: true, topics: true, postedAt: true,
    },
    orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }],
    take: 30,
  })

  const scored = hotPosts.map(p => ({
    ...p,
    reactionScore: p.likeCount + p.commentCount * 2,
  })).sort((a, b) => b.reactionScore - a.reactionScore)

  for (let i = 0; i < Math.min(30, scored.length); i++) {
    const p = scored[i]
    console.log(`  ${String(i+1).padStart(2)}위 [${p.reactionScore}점] [${p.cafeName}/${p.boardCategory ?? '?'}] ${p.title}`)
    console.log(`      👍${p.likeCount} 💬${p.commentCount} 👁️${p.viewCount} | 감정:${p.sentiment ?? '미분석'} | 토픽:${p.topics?.slice(0,3).join(', ') ?? '없음'}`)
  }

  // ══════════════════════════════════════════════════════════
  // 2단계: 키워드 빈도 분석 (CafeTrend.keywords 종합)
  // ══════════════════════════════════════════════════════════
  console.log('\n📝 [2단계] 전체 기간 키워드 종합 TOP 30')
  const allTrends = await prisma.cafeTrend.findMany({
    select: { keywords: true, hotTopics: true, sentimentMap: true, personaHints: true, totalPosts: true, date: true }
  })

  const keywordMap = new Map<string, number>()
  const topicMap   = new Map<string, number>()
  const totalSentiment = { positive: 0, neutral: 0, negative: 0, total: 0 }

  for (const t of allTrends) {
    const kws = t.keywords as Keyword[] ?? []
    for (const kw of kws) {
      keywordMap.set(kw.word, (keywordMap.get(kw.word) ?? 0) + kw.frequency)
    }
    const hts = t.hotTopics as HotTopic[] ?? []
    for (const ht of hts) {
      topicMap.set(ht.topic, (topicMap.get(ht.topic) ?? 0) + ht.count)
    }
    const sm = t.sentimentMap as SentimentMap
    if (sm) {
      totalSentiment.positive += sm.positive ?? 0
      totalSentiment.neutral  += sm.neutral  ?? 0
      totalSentiment.negative += sm.negative ?? 0
      totalSentiment.total++
    }
  }

  const topKeywords = [...keywordMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 30)
  const topTopics = [...topicMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 20)

  console.log('  [상위 키워드 TOP 30]')
  topKeywords.forEach(([word, freq], i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${word}: ${freq}회`)
  })

  console.log('\n  [상위 토픽 TOP 20]')
  topTopics.forEach(([topic, count], i) => {
    console.log(`  ${String(i+1).padStart(2)}. ${topic}: ${count}건`)
  })

  // ══════════════════════════════════════════════════════════
  // 3단계: 감정 분포 분석
  // ══════════════════════════════════════════════════════════
  console.log('\n💭 [3단계] 감정 분포 분석')
  await prisma.cafePost.groupBy({
    by: ['boardCategory', 'sentiment'],
    _count: { id: true },
    _avg: { likeCount: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const negativeTop = await prisma.cafePost.findMany({
    where: { sentiment: 'negative', isUsable: true },
    select: { title: true, cafeName: true, boardCategory: true, likeCount: true, commentCount: true },
    orderBy: [{ likeCount: 'desc' }],
    take: 10,
  })

  if (totalSentiment.total > 0) {
    const avg = totalSentiment.total
    console.log(`  전체 평균 감정 분포 (${allTrends.length}일 치 트렌드 기준):`)
    console.log(`  😊 긍정: ${(totalSentiment.positive/avg).toFixed(1)}% | 😐 중립: ${(totalSentiment.neutral/avg).toFixed(1)}% | 😔 부정: ${(totalSentiment.negative/avg).toFixed(1)}%`)
  }

  console.log('\n  [부정 감정 상위 인기글 TOP 10 — 미해결 니즈(Unmet Needs)]')
  negativeTop.forEach((p, i) => {
    console.log(`  ${i+1}. [${p.cafeName}/${p.boardCategory ?? '?'}] ${p.title} (👍${p.likeCount} 💬${p.commentCount})`)
  })

  // ══════════════════════════════════════════════════════════
  // 4단계: 페르소나 힌트 종합 (CafeTrend.personaHints)
  // ══════════════════════════════════════════════════════════
  console.log('\n👤 [4단계] AI가 감지한 페르소나 힌트 종합')
  const personaMap = new Map<string, string[]>()
  for (const t of allTrends) {
    const hints = t.personaHints as PersonaHint[] ?? []
    for (const h of hints) {
      if (!personaMap.has(h.type)) personaMap.set(h.type, [])
      if (h.description && !personaMap.get(h.type)!.includes(h.description)) {
        personaMap.get(h.type)!.push(h.description)
      }
    }
  }
  for (const [type, descs] of personaMap.entries()) {
    console.log(`\n  [${type}]`)
    descs.slice(0, 3).forEach(d => console.log(`  · ${d}`))
  }

  // ══════════════════════════════════════════════════════════
  // 5단계: 카테고리별 욕망 지도 요약
  // ══════════════════════════════════════════════════════════
  console.log('\n🗺️  [5단계] 카테고리별 욕망 지도 (반응 지수 기준)')
  const categoryDesire = await prisma.cafePost.groupBy({
    by: ['boardCategory'],
    _count: { id: true },
    _sum: { likeCount: true, commentCount: true, viewCount: true },
    _avg: { qualityScore: true },
    orderBy: { _sum: { likeCount: 'desc' } },
  })

  for (const c of categoryDesire) {
    const cat = c.boardCategory ?? '미분류'
    const totalReaction = (c._sum.likeCount ?? 0) + (c._sum.commentCount ?? 0) * 2
    console.log(`  · ${cat.padEnd(12)} | 글 ${String(c._count.id).padStart(4)}건 | 반응합계 ${String(totalReaction).padStart(6)} | 평균품질 ${c._avg.qualityScore?.toFixed(1)}`)
  }

  console.log('\n✅ ====== 분석 완료 ======\n')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
