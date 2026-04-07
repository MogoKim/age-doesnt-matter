/**
 * 매거진 QA 수정 스크립트 — 2026-04-07
 * slug 컬럼 미마이그레이션 → prisma.$executeRaw 사용
 */
import { prisma, disconnect } from '../core/db.js'
import { generateMagazineImageByContext } from '../cafe/image-generator.js'
import { generateMagazineThumbnail } from '../cafe/thumbnail-generator.js'
import { getDefaultImagePlan } from '../core/image-prompt-builder.js'
import { notifySlack } from '../core/notifier.js'

// ── 1번 글: JSON 래핑 복구 ──────────────────────────────────────────────────
async function fixJsonWrappedArticle(id: string) {
  console.log(`\n[FIX-1] JSON 래핑 복구: ${id}`)
  const rows = await prisma.$queryRaw<{content: string, title: string}[]>`
    SELECT content, title FROM "Post" WHERE id = ${id}
  `
  if (!rows[0]) { console.error('글 없음'); return false }
  const raw = rows[0].content

  // JSON "content" 필드 추출
  const contentMatch = raw.match(/"content"\s*:\s*"([\s\S]+?)(?="(?:,|\s*\})|\s*$)/)
  const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/)

  if (!contentMatch) {
    console.error('[FIX-1] content 추출 실패 → DRAFT 전환')
    await prisma.$executeRaw`UPDATE "Post" SET status = 'DRAFT' WHERE id = ${id}`
    return false
  }

  let cleanContent = contentMatch[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/<\/li<\/p>/g, '</li></ul></p>')
    .trim()

  const newTitle = titleMatch ? titleMatch[1] : rows[0].title
  console.log(`[FIX-1] 복구된 제목: ${newTitle}`)
  console.log(`[FIX-1] content ${cleanContent.length}자 | 미리보기: ${cleanContent.slice(0,80)}`)

  await prisma.$executeRaw`UPDATE "Post" SET title = ${newTitle}, content = ${cleanContent} WHERE id = ${id}`
  console.log('[FIX-1] ✅ content 복구 완료')
  return true
}

// ── 이미지 생성 + 삽입 ────────────────────────────────────────────────────────
async function insertImagesForPost(id: string, title: string, category: string) {
  console.log(`\n[FIX-IMG] "${title}" (${category})`)
  const [ctx1, ctx2] = getDefaultImagePlan(category)

  // 히어로 이미지
  const heroImg = await generateMagazineImageByContext(ctx1)
  if (!heroImg) {
    console.warn('[FIX-IMG] ⚠️ 히어로 이미지 생성 실패')
    return false
  }
  console.log(`[FIX-IMG] 히어로 (${heroImg.source}): ${heroImg.url.slice(0, 60)}...`)

  // 본문 이미지
  const bodyImg = await generateMagazineImageByContext(ctx2)
  if (bodyImg) console.log(`[FIX-IMG] 본문 (${bodyImg.source}): ${bodyImg.url.slice(0, 60)}...`)

  // 현재 content
  const rows = await prisma.$queryRaw<{content: string}[]>`SELECT content FROM "Post" WHERE id = ${id}`
  let content = rows[0].content

  const heroImgTag = `<img src="${heroImg.url}" alt="${title} 관련 이미지" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`
  const h2h3Match = content.match(/<h[23]/)
  if (h2h3Match?.index !== undefined) {
    content = content.slice(0, h2h3Match.index) + heroImgTag + '\n\n' + content.slice(h2h3Match.index)
  } else {
    content = heroImgTag + '\n\n' + content
  }

  if (bodyImg) {
    const bodyImgTag = `<img src="${bodyImg.url}" alt="${title} 생활 이미지" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`
    const allH = [...content.matchAll(/<h[23]/g)]
    if (allH.length >= 2) {
      const idx = allH[1].index!
      content = content.slice(0, idx) + bodyImgTag + '\n\n' + content.slice(idx)
    } else {
      content += '\n\n' + bodyImgTag
    }
  }

  // 썸네일
  let thumbnailUrl = heroImg.url
  try {
    thumbnailUrl = await generateMagazineThumbnail({ title, category, postId: id }) ?? heroImg.url
    console.log(`[FIX-IMG] 썸네일: ${thumbnailUrl.slice(0, 60)}...`)
  } catch { console.log('[FIX-IMG] 썸네일 생성 실패 → 히어로 이미지 사용') }

  await prisma.$executeRaw`UPDATE "Post" SET content = ${content}, "thumbnailUrl" = ${thumbnailUrl} WHERE id = ${id}`
  console.log('[FIX-IMG] ✅ 완료')
  return true
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('===== 매거진 QA 수정 시작 =====')
  const results: {id: string; title: string; ok: boolean; action: string}[] = []

  // 1번 글 JSON 복구
  const jsonFixed = await fixJsonWrappedArticle('cmno41rgd0000wizf3o48ctew')
  results.push({ id: 'cmno41rgd0000wizf3o48ctew', title: '갱년기 Q&A 복구', ok: jsonFixed, action: 'JSON→HTML' })

  // 1번 글 이미지 삽입
  if (jsonFixed) {
    const ok = await insertImagesForPost('cmno41rgd0000wizf3o48ctew', '갱년기, 불면증, 새로운 시작', '건강')
    results.push({ id: 'cmno41rgd0000wizf3o48ctew', title: '갱년기 Q&A 이미지', ok, action: '이미지 삽입' })
  }

  // 이미지 없는 4개 글
  const noImgPosts = [
    { id: 'cmnmp1mht0000wvzf5jb9lcqq', title: '잠 못 드는 밤, 우리 또래라면', category: '건강' },
    { id: 'cmnmohtkd0000ymzff41tcyig', title: '갑작스러운 위기, 미리 준비하면', category: '건강' },
    { id: 'cmnl9arba0000z1zfm952hwt7', title: '갱년기 불면증, 혼자만 겪는 게 아니었어요', category: '건강' },
    { id: 'cmnjt4nw30000ywzfvvnuagz1', title: '우리 몸이 보내는 신호', category: '건강' },
  ]

  for (const p of noImgPosts) {
    const ok = await insertImagesForPost(p.id, p.title, p.category)
    results.push({ id: p.id, title: p.title, ok, action: '이미지 삽입' })
  }

  // 결과 요약
  console.log('\n===== 수정 결과 요약 =====')
  results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.title.slice(0,28).padEnd(28)} | ${r.action}`))
  const ok = results.filter(r => r.ok).length
  const fail = results.filter(r => !r.ok).length
  console.log(`\n총 ${results.length}건: ✅ ${ok} 성공, ❌ ${fail} 실패`)

  await notifySlack({
    level: 'info',
    agent: 'MAGAZINE_QA_FIX',
    title: `매거진 QA 수정 완료 — ${ok}/${results.length}건`,
    body: results.map(r => `${r.ok?'✅':'❌'} ${r.title.slice(0,20)} (${r.action})`).join('\n'),
  })

  await disconnect()
}

main().catch(async err => {
  console.error('[MagazineFix] 오류:', err)
  await disconnect()
  process.exit(1)
})
