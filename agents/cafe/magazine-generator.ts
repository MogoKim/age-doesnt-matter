/**
 * 매거진 자동생성기
 * CafeTrend.magazineTopics를 기반으로 에디터 스타일 매거진 글 생성
 * LOCAL ONLY — launchd 12:00 KST 실행
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import { loadTodayBrief } from '../core/intelligence.js'
import type { MagazineSuggestion } from './types.js'
import { matchCpsProducts, saveCpsLinks } from './cps-matcher.js'
import { generateMagazineImageByContext } from './image-generator.js'
import { buildMagazineHtml, buildMagazineHtmlV2, parseSectionsFromAI } from './magazine-template.js'
import { getDefaultImagePlan, type ImageContext } from '../core/image-prompt-builder.js'
import { buildMagazineSystemPrompt, EDITORIAL_V2_FIELDS, DESIRE_TO_CATEGORY, DESIRE_TOPIC_HINTS } from '../magazine/prompt.js'
import { pickLongtailKeywords } from '../magazine/longtail-keywords.js'
import { getActiveSeriesToday } from '../magazine/series-plan.js'
import { requestGoogleIndexing } from './indexing-api.js'
import * as keywordQueue from '../magazine/keyword-queue.js'
import { createHash } from 'crypto'
import type { QueueEvent, QueueState } from '../magazine/keyword-queue.js'
import type { PublishPolicy } from '../magazine/keyword-research/scorer.js'

const CLAUDE_MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const CLAUDE_MODEL_STRATEGIC = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const client = new Anthropic()

// ─── 히어로↔본문 이미지 distinctness 가드 ──────────────────────────────────────
// 본문 이미지가 히어로와 동일/저해상으로 발행되는 것을 막기 위한 검사.
// (근본 버그: ChatGPT 갤러리 썸네일(약 512px)이 본문에 그대로 박힘 — scraper에서도
//  해상도 가드를 추가했고, 여기서는 발행 직전 2차 방어선으로 동일/저해상을 잡아낸다.)

/** 본문 이미지가 "정상"으로 인정되는 최소 해상도(px). 미만이면 저해상 미리보기로 간주. */
const MIN_BODY_IMAGE_PX = 800

type ImageMeta = { bytes: number; width: number; height: number; md5: string }

/** PNG/WebP(VP8·VP8L·VP8X)/JPEG 헤더에서 해상도를 파싱 (외부 의존성 없음). 실패 시 null */
function readImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: \x89PNG\r\n\x1a\n + IHDR(width@16, height@20, big-endian)
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // WebP: 'RIFF'....'WEBP'
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16)
    if (fmt === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    }
    if (fmt === 'VP8L') {
      const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24]
      const width = 1 + (((b2 & 0x3f) << 8) | b1)
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
      return { width, height }
    }
    if (fmt === 'VP8X') {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16))
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
      return { width, height }
    }
  }
  // JPEG: SOF0..SOF3/5..7/9..11/13..15 마커에서 height@5, width@7
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue }
      const marker = buf[off + 1]
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) }
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue }
      const segLen = buf.readUInt16BE(off + 2)
      if (segLen < 2) break
      off += 2 + segLen
    }
  }
  return null
}

/** R2 이미지 URL을 받아 바이트수·해상도·md5를 조회. 실패 시 null (검사 실패가 발행을 막지 않게 fail-open) */
async function inspectImage(url: string): Promise<ImageMeta | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const dim = readImageDimensions(buf)
    return {
      bytes: buf.length,
      width: dim?.width ?? 0,
      height: dim?.height ?? 0,
      md5: createHash('md5').update(buf).digest('hex'),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 본문 이미지가 히어로와 동일/유사·저해상인지 판정.
 * - URL 동일 → 'duplicate-url'
 * - 바이트 md5 동일 → 'duplicate-bytes'
 * - 본문 해상도가 MIN_BODY_IMAGE_PX 미만 → 'low-res' (저해상 미리보기 의심)
 * 메타 조회 실패 시 fail-open(flagged=false) — 검사가 발행을 막지 않도록.
 */
async function flagBodyImage(heroUrl: string, bodyUrl: string): Promise<{ flagged: boolean; reason: string }> {
  if (heroUrl === bodyUrl) return { flagged: true, reason: 'duplicate-url' }
  const [hero, body] = await Promise.all([inspectImage(heroUrl), inspectImage(bodyUrl)])
  if (body && hero && body.md5 === hero.md5) return { flagged: true, reason: 'duplicate-bytes' }
  if (body && body.width > 0 && (body.width < MIN_BODY_IMAGE_PX || body.height < MIN_BODY_IMAGE_PX)) {
    return { flagged: true, reason: `low-res(${body.width}x${body.height})` }
  }
  return { flagged: false, reason: '' }
}

/** 카테고리 자동 매핑 */
function detectCategory(title: string, reason: string): string {
  const text = `${title} ${reason}`.toLowerCase()

  // 1단계: 재테크 우선 phrase — '건강보험'이 '건강'으로 오분류되는 substring 버그 방지
  const financeFirstPhrases = [
    '건강보험', '건보', '피부양자', '보험료', '실손보험',
    '퇴직연금', 'irp', '연금저축', '세액공제', '노후자금',
    '재테크', '저축', '투자', '부동산',
  ]
  if (financeFirstPhrases.some(kw => text.includes(kw))) return '재테크'

  // 2단계: 관계 카테고리 — prompt.ts DESIRE_TO_CATEGORY.RELATION='관계'와 동기화
  const relationPhrases = ['연인', '부부', '황혼', '이성', '재혼', '연애', '외로움', '친구 사귀']
  if (relationPhrases.some(kw => text.includes(kw))) return '관계'

  // 3단계: 기존 map 순회 (건강 포함 — 이제 재테크와 substring 충돌 없음)
  const map: Record<string, string[]> = {
    '건강': ['건강', '운동', '관절', '영양', '수면', '병원', '치매', '혈압', '당뇨', '걷기', '갱년기'],
    '재테크': ['재테크', '연금', '저축', '투자', '부동산', '노후', '퇴직연금'],
    '은퇴준비': ['은퇴', '퇴직', '인생 2막', '2막', '노후 준비', '노후준비', '은퇴 준비'],
    '일자리': ['일자리', '취업', '자격증', '봉사', '창업', '알바', '재취업', '파트타임'],
    '생활': ['살림', '정리', '세탁', '절약', '생활', '꿀팁', '재활용'],
    '여행': ['여행', '맛집', '산책', '둘레길', '관광', '기차', '드라이브'],
    '문화': ['독서', '영화', '드라마', '음악', '전시', '공연', '문화'],
    '요리': ['요리', '레시피', '반찬', '김치', '밑반찬', '제철', '장보기'],
  }

  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some(kw => text.includes(kw))) return cat
  }
  return '생활'
}

/** 최근 매거진과 주제 중복 체크 */
async function getRecentMagazineTitles(days: number): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const recent = await prisma.post.findMany({
    where: {
      boardType: 'MAGAZINE',
      status: 'PUBLISHED',
      createdAt: { gte: since },
    },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  return recent.map(p => p.title)
}

/**
 * 새 제목이 기존 제목과 의미상 중복인지 체크
 * - 첫 두 단어(키워드) 공유 시 중복으로 판단
 * - 예: "갱년기 수면 개선법" vs "갱년기 수면 어떻게" → 중복
 */
function isSimilarTitle(newTitle: string, existingTitles: string[]): boolean {
  const extractKeywords = (title: string) =>
    title.replace(/[,.\s]+/g, ' ').trim().split(' ').filter(w => w.length > 1).slice(0, 3)

  const newKws = extractKeywords(newTitle)

  return existingTitles.some(existing => {
    const existKws = extractKeywords(existing)
    // 첫 두 키워드 중 2개 이상 겹치면 중복
    const overlap = newKws.filter(kw => existKws.includes(kw)).length
    return overlap >= 2
  })
}

/**
 * 제목 정규화 — 공백·기호 제거 후 글자 정렬.
 * 어순/띄어쓰기만 다른 쌍둥이 제목을 같은 값으로 만든다.
 * 예: "노후 주거 시나리오 3가지 비교" === "노후 주거 3가지 시나리오 비교"
 */
function normalizeTitle(title: string): string {
  return title.replace(/[^가-힣0-9a-zA-Z]/g, '').split('').sort().join('')
}

/**
 * 전체 기간 중복 가드 — isSimilarTitle(7일 윈도우)이 못 잡는 장기 간격 쌍둥이 차단.
 * 정규화 제목이 기존 PUBLISHED 매거진과 동일하면 true (어순만 다른 글·완전 동일 글 모두 차단).
 * DB 실패 시 false 반환 → 발행 계속 (가드는 보조 안전장치).
 */
async function isDuplicateAllTime(title: string): Promise<boolean> {
  const target = normalizeTitle(title)
  if (!target) return false
  try {
    const all = await prisma.post.findMany({
      where: { boardType: 'MAGAZINE', status: 'PUBLISHED' },
      select: { title: true },
    })
    return all.some(p => normalizeTitle(p.title) === target)
  } catch (err) {
    console.warn('[MagazineGenerator] 전체기간 중복 체크 실패 (무시):', err)
    return false
  }
}

/** 카페 참고글 가져오기 */
async function getReferencePosts(topic: MagazineSuggestion) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)

  return prisma.cafePost.findMany({
    where: {
      isUsable: true,
      crawledAt: { gte: yesterday },
      OR: [
        { title: { contains: topic.title.split(' ')[0], mode: 'insensitive' } },
        ...(topic.relatedPosts.length > 0
          ? [{ title: { in: topic.relatedPosts } }]
          : []),
      ],
    },
    orderBy: { likeCount: 'desc' },
    take: 5,
    select: { title: true, content: true, cafeName: true, likeCount: true },
  })
}

/** 매거진 글 생성 (평일: Sonnet / 일요일 특집: Opus) */
async function generateMagazineArticle(
  topic: MagazineSuggestion,
  category: string,
  referencePosts: { title: string; content: string; cafeName: string }[],
  recentTitles: string[],
): Promise<{ title: string; content: string; summary: string; imageContexts: ImageContext[]; seoTitle: string | null; seoDescription: string | null; directAnswer: string; summaryPoints: string[] } | null> {
  const refs = referencePosts.map((p, i) =>
    `[${i + 1}] (${p.cafeName}) "${p.title}"\n${p.content.slice(0, 300)}`,
  ).join('\n\n')

  const recentList = recentTitles.slice(0, 10).map(t => `- ${t}`).join('\n')

  const longtailKws = pickLongtailKeywords(category, topic.title, 3)
  const longtailSection = longtailKws.length > 0
    ? longtailKws.map(kw => `- "${kw.keyword}" (${kw.intent})`).join('\n')
    : ''

  // 일요일(KST) = Opus 특집호, 평일 = Sonnet
  const now = new Date()
  const kstDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getDay()
  const isSunday = kstDay === 0
  const model = isSunday ? CLAUDE_MODEL_STRATEGIC : CLAUDE_MODEL_HEAVY
  console.log(`[Magazine] 모델: ${isSunday ? 'Opus (일요일 특집)' : 'Sonnet (평일)'}`)

  // editorial v2 — flag ON 시에만 직접답변/핵심요약 요청 (기본 false = v1)
  const editorialV2 = process.env.MAGAZINE_EDITORIAL_V2_ENABLED === 'true'

  const response = await client.messages.create({
    model,
    max_tokens: 4500,
    system: buildMagazineSystemPrompt(category, editorialV2),
    messages: [{
      role: 'user',
      content: `"${topic.title}" 주제로 매거진 기사를 작성해주세요.
카테고리: ${category}
추천 이유: ${topic.reason}

${refs ? `참고 자료 (카페 인기글):\n${refs}` : ''}

${recentList ? `최근 발행 매거진 (중복 주제 피해주세요):\n${recentList}` : ''}

${longtailSection ? `SEO 타겟 롱테일 키워드 (아래 중 1~2개를 제목 또는 본문에 자연스럽게 포함하세요):\n${longtailSection}` : ''}

응답 형식 (반드시 아래 형식을 따라주세요):
제목: (20자 이내, 핵심을 담은 제목)
요약: (40자 이내, 한 줄 요약)
seoTitle: (50자 이내, 주요 키워드 앞에 배치, 숫자 포함 권장. 연도는 쓰지 말 것. 예: "50대 갱년기 증상 7가지 완벽 정리")
seoDescription: (120자 이내, 첫 문장에 직접 답변, "50대" "갱년기" 등 핵심 키워드 포함, 공감 유도)${editorialV2 ? `\n${EDITORIAL_V2_FIELDS}` : ''}
이미지컨텍스트1: type:PERSON_REAL|FOOD_PHOTO|SCENE_PHOTO|OBJECT_PHOTO|ILLUSTRATION, gender:female|male(인물일 때만), context:(영문 이미지 설명), unsplash:(FOOD_PHOTO·SCENE_PHOTO·OBJECT_PHOTO만 영문 검색어 작성 — PERSON_REAL과 ILLUSTRATION은 이 필드 생략), altKo:(한국어 이미지 설명 20자 이내)
이미지컨텍스트2: type:PERSON_REAL|FOOD_PHOTO|SCENE_PHOTO|OBJECT_PHOTO|ILLUSTRATION, gender:female|male(인물일 때만), context:(영문 이미지 설명), unsplash:(FOOD_PHOTO·SCENE_PHOTO·OBJECT_PHOTO만 영문 검색어 작성 — PERSON_REAL과 ILLUSTRATION은 이 필드 생략), altKo:(한국어 이미지 설명 20자 이내)
본문: (HTML, 1500~2000자, 소제목 3~4개, 각 15자 이내)

본문 구조:
<h2>소제목 1 — 핵심 정보 (15자 이내)</h2>
<p>독자 현실 공감 + 핵심 정보. 출처 포함 통계 1개. 최대 4문장.</p>
<!-- [IMAGE:1] -->

<h2>소제목 2 — 실용 정보 (15자 이내)</h2>
<p>바로 쓸 수 있는 실용 정보. 구체적 수치/방법. 최대 4문장.</p>
<!-- [IMAGE:2] -->

<h2>소제목 3 — 실제 경험 / 사례 (15자 이내)</h2>
<p>우나어 커뮤니티 또는 50·60대 실제 경험담 형식. 공감 유도. 최대 3문장.</p>

<aside class="tip-box">💡 꿀팁: 오늘 당장 실천할 수 있는 구체적 행동 2~3가지</aside>

<p>마무리 1~2문장 — 응원 + 우나어 커뮤니티 자연스러운 언급</p>

<!-- FAQ 섹션 (반드시 포함, GEO 최적화) -->
<!-- FAQ_START -->
<section class="faq-section">
<h2>자주 묻는 질문</h2>
<details><summary>Q. [독자가 AI에 실제로 물어볼 법한 완성형 질문 — "어떻게 해요?/정상인가요?/왜 그런가요?" 형식]</summary>
<p>A. [2~3문장 직접 답변. 모호하지 않게. 수치/기준 포함 권장]</p></details>
<details><summary>Q. [두 번째 질문]</summary>
<p>A. [직접 답변]</p></details>
<details><summary>Q. [세 번째 질문]</summary>
<p>A. [직접 답변]</p></details>
</section>
<!-- FAQ_END -->`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const summaryMatch = text.match(/요약:\s*(.+)/)
  const seoTitleMatch = text.match(/seoTitle:\s*(.+)/)
  const seoDescriptionMatch = text.match(/seoDescription:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  if (!titleMatch || !bodyMatch) return null

  // editorial v2 — 직접답변/핵심요약 파싱 (없으면 빈값 → 템플릿이 박스 생략 = degrade)
  const directAnswer = text.match(/직접답변:\s*(.+)/)?.[1]?.trim() ?? ''
  const summaryBlock = text.match(/핵심요약:\s*\n?([\s\S]*?)(?=\n\s*(?:이미지컨텍스트1:|seoTitle:|본문:))/)
  const summaryPoints = summaryBlock
    ? summaryBlock[1].split('\n').map((l) => l.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean).slice(0, 3)
    : []

  // 이미지 컨텍스트 파싱
  const imageContexts: ImageContext[] = []
  for (let n = 1; n <= 2; n++) {
    const ctxMatch = text.match(new RegExp(`이미지컨텍스트${n}:\\s*(.+)`))
    if (ctxMatch) {
      const raw = ctxMatch[1]
      const typeMatch = raw.match(/type:(\w+)/)
      const genderMatch = raw.match(/gender:(female|male)/)
      const contextMatch = raw.match(/context:([^,\n]+)/)
      const unsplashMatch = raw.match(/unsplash:([^,\n]+)/)

      if (typeMatch && contextMatch) {
        const ctx: ImageContext = {
          type: typeMatch[1] as ImageContext['type'],
          dallePrompt: contextMatch[1].trim(),
        }
        if (genderMatch) ctx.gender = genderMatch[1] as 'female' | 'male'
        if (unsplashMatch) ctx.unsplashQuery = unsplashMatch[1].trim()
        const altKoMatch = raw.match(/altKo:([^,\n]+)/)
        if (altKoMatch) ctx.altKo = altKoMatch[1].trim()
        imageContexts.push(ctx)
      }
    }
  }

  // AI가 마크다운 코드 펜스로 감싼 경우 제거 (```html ... ```)
  const rawContent = bodyMatch[1].trim()
  const cleanContent = rawContent
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')

  return {
    title: titleMatch[1].trim(),
    summary: summaryMatch?.[1]?.trim() ?? '',
    content: cleanContent,
    imageContexts,
    seoTitle: seoTitleMatch?.[1]?.trim().slice(0, 50) ?? null,
    seoDescription: seoDescriptionMatch?.[1]?.trim().slice(0, 120) ?? null,
    directAnswer,
    summaryPoints,
  }
}

/** title로부터 SEO-friendly URL slug 생성 (DB 중복 체크로 uniqueness 보장) */
async function generateMagazineSlug(title: string): Promise<string> {
  const base = title
    .replace(/[^\w\s가-힣]/g, '')  // 한글, 영숫자, 공백만 허용
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)

  // 중복 없으면 clean slug 그대로 사용
  const exists = await prisma.post.findUnique({ where: { slug: base }, select: { id: true } })
  if (!exists) return base

  // 중복 있으면 숫자 suffix (-2, -3, ..., -9)
  for (let i = 2; i <= 9; i++) {
    const candidate = `${base}-${i}`
    const dup = await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!dup) return candidate
  }
  return `${base}-${Date.now()}` // 극히 드문 fallback
}

interface SeriesMeta {
  seriesId: string
  seriesTitle: string
  seriesOrder: number
  seriesCount: number
  seasonId: string
}

/** 매거진 게시 (에디터 봇 계정 사용) */
async function publishMagazine(
  article: { title: string; content: string; summary: string; seoTitle: string | null; seoDescription: string | null },
  category: string,
  thumbnailUrl?: string,
  seriesMeta?: SeriesMeta,
): Promise<{ id: string; slug: string }> {
  // 매거진 전용 봇 — 페르소나 B(정순씨) 사용 (차분한 일기체 정보형)
  const editorUserId = await getBotUser('B')
  const slug = await generateMagazineSlug(article.title)

  const post = await prisma.post.create({
    data: {
      title: article.title,
      content: article.content,
      summary: article.summary,
      thumbnailUrl: thumbnailUrl ?? null,
      boardType: 'MAGAZINE',
      category,
      authorId: editorUserId,
      source: 'BOT',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      slug,
      seoTitle: article.seoTitle ?? null,
      seoDescription: article.seoDescription ?? null,
      // 시리즈 메타 (단발 기사는 null)
      seriesId: seriesMeta?.seriesId ?? null,
      seriesTitle: seriesMeta?.seriesTitle ?? null,
      seriesOrder: seriesMeta?.seriesOrder ?? null,
      seriesCount: seriesMeta?.seriesCount ?? null,
      seasonId: seriesMeta?.seasonId ?? null,
    },
  })

  return { id: post.id, slug }
}

/** seoTitle exact duplicate 체크 — null 시 스킵, DB 실패 시 발행 계속 */
async function isSeoTitleDuplicate(seoTitle: string | null): Promise<boolean> {
  if (!seoTitle) return false
  try {
    const existing = await prisma.post.findFirst({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
        seoTitle: { equals: seoTitle.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    })
    return !!existing
  } catch (err) {
    console.warn('[MagazineGenerator] seoTitle 중복 체크 실패 (무시):', err)
    return false
  }
}

/** 발행 후 QA — Slack warning only, 발행 취소 없음 */
async function postPublishQA(
  article: { title: string; content: string; seoTitle: string | null; thumbnailUrl?: string },
  category: string,
): Promise<void> {
  try {
    const warnings: string[] = []

    const plainLen = article.content.replace(/<[^>]*>/g, '').trim().length
    if (plainLen < 1500) warnings.push(`⚠️ 본문 ${plainLen}자 (기준 1500자)`)

    if (!article.thumbnailUrl) warnings.push('⚠️ 히어로 이미지 없음')

    const ALLOWED_CATEGORIES = [
      '건강', '재테크', '은퇴준비', '생활', '관계', '여행',
      '문화', '요리', '취미', '일자리', '집꾸미기', '패션', '간병',
    ]
    if (!ALLOWED_CATEGORIES.includes(category)) warnings.push(`⚠️ 카테고리 이상: ${category}`)

    if (!article.seoTitle) warnings.push('⚠️ seoTitle 없음')

    const hasExternalAnchor = /<a\s[^>]*href=["']https?:\/\//i.test(article.content)
    if (!hasExternalAnchor) warnings.push('⚠️ 외부 출처 anchor 링크 없음')

    if (warnings.length > 0) {
      await notifySlack({
        level: 'important',
        agent: 'MAGAZINE_QA',
        title: `📋 발행 QA 경고 — ${article.title}`,
        body: warnings.join('\n'),
      })
    }
  } catch (err) {
    console.warn('[MagazineQA] QA 실패 (무시):', err)
  }
}

export interface MagazineRunResult {
  title: string
  category: string
  postId: string
  heroImageSource: 'local' | 'unsplash' | 'dalle' | 'none'
}

/** 메인 실행 */
export async function main(): Promise<MagazineRunResult[]> {
  // IMAGE_GENERATOR 가드 — GHA/클라우드 환경에서 발행 완전 차단 (Gemini Playwright 불가)
  const imageEngine = process.env.IMAGE_GENERATOR
  if (!imageEngine) {
    console.log('[MagazineGenerator] IMAGE_GENERATOR 미설정 — 클라우드 환경, 발행 스킵')
    await notifySlack({ level: 'important', agent: 'MAGAZINE_GENERATOR', title: '⚠️ IMAGE_GENERATOR 미설정', body: '발행 불가 — 로컬 환경 환경변수 점검 필요' })
    await disconnect()
    return []
  }

  console.log('[MagazineGenerator] 시작')
  const startTime = Date.now()

  // 키워드 큐 모드 (env 플래그) — false면 기존 동작 그대로 유지(byte-identical)
  const QUEUE_ENABLED = process.env.MAGAZINE_KEYWORD_QUEUE_ENABLED === 'true'
  const SESSION = process.env.SESSION_TIME ?? 'morning'
  const dailyCap = QUEUE_ENABLED ? 2 : 3 // 큐 모드: 하루 2편
  const sessionPublishCap = QUEUE_ENABLED ? 1 : 3 // 큐 모드: 세션당 1편

  // 중복 발행 가드 — 로컬 launchd 일일 한도
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayPublished = await prisma.post.count({
    where: {
      boardType: 'MAGAZINE',
      source: 'BOT',
      publishedAt: { gte: today },
    },
  })
  if (todayPublished >= dailyCap) {
    console.log(`[MagazineGenerator] 오늘 이미 ${todayPublished}편 발행됨 — 일일 최대 ${dailyCap}편 초과, 스킵`)
    await notifySlack({ level: 'info', agent: 'MAGAZINE_GENERATOR', title: 'ℹ️ 일일 한도 도달', body: `오늘 ${todayPublished}편 발행 완료 — 이후 실행 스킵` })
    await disconnect()
    return []
  }

  // 1) 오늘/어제 트렌드 분석 결과 조회
  let trend = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'daily' } },
  })

  // 오늘 없으면 어제 것 사용
  if (!trend) {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    trend = await prisma.cafeTrend.findUnique({
      where: { date_period: { date: yesterday, period: 'daily' } },
    })
  }

  if (!trend) {
    console.log('[MagazineGenerator] 트렌드 분석 없음 — 욕망 지도 기반 폴백으로 진행')
  }

  // GEO 시드 주제 확인 — period='geo_seed'로 미리 INSERT된 주제가 있으면 최우선 처리
  const geoSeed = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'geo_seed' } },
  })
  const geoTopics = geoSeed
    ? (geoSeed.magazineTopics as unknown as MagazineSuggestion[])
    : []

  // 시리즈 우선순위 — 오늘 발행해야 할 시리즈 편 체크
  const seriesMetaMap = new Map<string, SeriesMeta>()  // topic.title → 시리즈 메타
  const seriesTopics: MagazineSuggestion[] = []
  const todaySeriesItems = getActiveSeriesToday(today)
  for (const item of todaySeriesItems) {
    seriesTopics.push({
      title: item.episodeTitle,
      reason: `시리즈: ${item.series.title} (${item.episodeIndex + 1}/${item.series.topics.length}편)`,
      relatedPosts: [],
      score: 10,  // 시리즈 편은 최고 우선순위
    })
    seriesMetaMap.set(item.episodeTitle, {
      seriesId: item.series.seriesId,
      seriesTitle: item.series.title,
      seriesOrder: item.episodeIndex + 1,
      seriesCount: item.series.topics.length,
      seasonId: item.series.seasonId,
    })
    console.log(`[MagazineGenerator] 📚 시리즈 주제: ${item.series.title} ${item.episodeIndex + 1}/${item.series.topics.length}편 — "${item.episodeTitle}"`)
  }

  const magazineTopics = [
    ...seriesTopics,  // 시리즈 최우선
    ...geoTopics,
    ...((trend?.magazineTopics ?? []) as unknown as MagazineSuggestion[]),
  ]

  // 키워드 큐 1순위 주입 (env 플래그 ON일 때만) — 기존 시리즈/GEO/트렌드는 fallback으로 강등
  const queueMeta = new Map<string, { normalized: string; publishPolicy: PublishPolicy; cluster: string }>()
  let queueState: QueueState | null = null
  if (QUEUE_ENABLED) {
    try {
      queueState = keywordQueue.loadState()
      const universe = keywordQueue.loadUniverse()
      const consumed = new Set(queueState.consumedNormalized)
      const candidates = keywordQueue.selectOrderedCandidates(universe, { limit: 30, excludeNormalized: consumed })
      const queueTopics: MagazineSuggestion[] = candidates.map((c) => ({
        title: c.keyword,
        reason: `queue:${c.cluster}/${c.intent}`,
        relatedPosts: [],
        score: 8, // 사전 검증된 후보 — 점수 게이트(>=7) 통과용 합성값
      }))
      for (const c of candidates) {
        queueMeta.set(c.keyword, { normalized: c.normalized, publishPolicy: c.publishPolicy, cluster: c.cluster })
      }
      magazineTopics.unshift(...queueTopics)
      console.log(`[MagazineGenerator] 키워드 큐 후보 ${candidates.length}개 1순위 주입 (session=${SESSION})`)
    } catch (err) {
      console.warn('[MagazineGenerator] 키워드 큐 로드 실패 — 기존 fallback 사용:', err)
      queueState = null
    }
  }

  // 큐 이벤트 기록 헬퍼 — 큐 토픽일 때만 동작(state 파일 기록, DB 아님). published/skipped_duplicate만 소비.
  const recordQueueEvent = (topicTitle: string, event: QueueEvent, postId?: string): void => {
    if (!queueState) return
    const qm = queueMeta.get(topicTitle)
    if (!qm) return
    keywordQueue.recordEvent(queueState, {
      event,
      keyword: topicTitle,
      normalized: qm.normalized,
      cluster: qm.cluster,
      publishPolicy: qm.publishPolicy,
      session: SESSION,
      postId,
    })
    if (event === 'published' || event === 'skipped_duplicate') {
      keywordQueue.markConsumed(queueState, qm.normalized)
    }
    keywordQueue.saveState(queueState)
  }

  // 욕망 지도 로드 — 주제 보강에 활용
  const brief = await loadTodayBrief({ fallbackToPrevious: true, consumedBy: 'magazine-generator' })
  const dominantDesire = brief?.dominantDesire ?? 'HEALTH'

  // 욕망 지도 기반 보충 주제: 매거진 주제가 부족하거나 현재 욕망과 다를 때 보강
  const desireHints = DESIRE_TOPIC_HINTS[dominantDesire] ?? DESIRE_TOPIC_HINTS['HEALTH']
  if (!magazineTopics || magazineTopics.length === 0) {
    // 욕망 지도 기반 폴백 주제 사용
    const fallbackTopic: MagazineSuggestion = {
      title: desireHints[Math.floor(Math.random() * desireHints.length)],
      reason: `오늘 커뮤니티 지배 욕망: ${dominantDesire}`,
      relatedPosts: [],
      score: 8,
    }
    console.log(`[MagazineGenerator] 욕망지도 폴백 주제 사용: "${fallbackTopic.title}"`)
    const category = DESIRE_TO_CATEGORY[dominantDesire] ?? '생활'
    const refs = await getReferencePosts(fallbackTopic)
    const recentTitles = await getRecentMagazineTitles(7)
    const article = await generateMagazineArticle(fallbackTopic, category, refs, recentTitles)
    if (!article) {
      console.log('[MagazineGenerator] 폴백 주제 생성 실패')
      await notifySlack({
        level: 'critical',
        agent: 'MAGAZINE_GENERATOR',
        title: '🚨 매거진 발행 완전 실패',
        body: '트렌드 주제 0개, 욕망지도 폴백 생성도 실패\n오늘 매거진 미발행\n→ DB CafeTrend 확인 필요',
      })
      await disconnect()
      return []
    }
    magazineTopics.push(fallbackTopic)
  }

  // 2) 최근 매거진 제목 (중복 방지)
  const recentTitles = await getRecentMagazineTitles(7)

  // 3) 주제 생성 — 큐 모드: 여러 후보 시도하되 sessionPublishCap(1)로 발행 제한
  const maxArticles = QUEUE_ENABLED ? magazineTopics.length : 3
  let publishedCount = 0
  let totalCpsCount = 0
  const publishedTitles: string[] = []
  const publishedResults: MagazineRunResult[] = []

  for (const topic of magazineTopics.slice(0, maxArticles)) {
    // 큐 토픽 식별 + 이중 no_publish 가드 (큐 후보가 혹시 no_publish면 발행 차단·보관)
    const qm = QUEUE_ENABLED ? queueMeta.get(topic.title) : undefined
    if (qm && qm.publishPolicy !== 'publish' && qm.publishPolicy !== 'publish_softened_title') {
      recordQueueEvent(topic.title, 'failed_no_publish_guard')
      console.warn(`[MagazineGenerator] no_publish 가드 차단: "${topic.title}" (${qm.publishPolicy})`)
      continue
    }

    // 점수 7 이상만 발행
    if (topic.score < 7) {
      console.log(`[MagazineGenerator] "${topic.title}" (${topic.score}/10) — 점수 미달, 스킵`)
      continue
    }

    // 의미 중복 주제 스킵
    const allRecentTitles = [...recentTitles, ...publishedTitles]
    if (isSimilarTitle(topic.title, allRecentTitles)) {
      recordQueueEvent(topic.title, 'skipped_duplicate')
      console.log(`[MagazineGenerator] "${topic.title}" — 최근 7일 유사 주제 이미 발행, 스킵`)
      continue
    }

    const category = detectCategory(topic.title, topic.reason)
    const refs = await getReferencePosts(topic)

    console.log(`[MagazineGenerator] 생성 중: "${topic.title}" [${category}] (참고글 ${refs.length}개)`)

    const article = await generateMagazineArticle(topic, category, refs, recentTitles)
    if (!article) {
      recordQueueEvent(topic.title, 'failed_generation')
      console.log(`[MagazineGenerator] "${topic.title}" — 생성 실패`)
      continue
    }

    // 전체 기간 중복 가드 — 7일 윈도우 밖의 쌍둥이(어순만 다름·완전 동일) 차단
    if (await isDuplicateAllTime(article.title)) {
      recordQueueEvent(topic.title, 'skipped_duplicate')
      console.log(`[MagazineGenerator] "${article.title}" — 전체기간 중복 제목 이미 발행, 스킵`)
      continue
    }

    // seoTitle exact duplicate 체크 (DB 실패 시 발행 계속)
    if (article.seoTitle && await isSeoTitleDuplicate(article.seoTitle)) {
      recordQueueEvent(topic.title, 'skipped_duplicate')
      console.log(`[MagazineGenerator] "${topic.title}" — seoTitle 중복, 다음 topic으로`)
      continue
    }

    // IMAGE_PROMPT 잔존 텍스트 방어 제거
    article.content = article.content.replace(/\[IMAGE_PROMPT:\s*.+?\]/g, '')

    // 이미지 컨텍스트: AI 제공 우선, 없으면 카테고리 기본값
    const [defaultCtx1, defaultCtx2] = getDefaultImagePlan(category)
    const ctxList = [
      article.imageContexts[0] ?? defaultCtx1,
      article.imageContexts[1] ?? defaultCtx2,
    ]

    // 히어로 이미지 (첫 번째 컨텍스트)
    const image = await generateMagazineImageByContext(ctxList[0])
    if (image) {
      console.log(`[MagazineGenerator] 히어로 이미지 (${ctxList[0].type}, ${image.source}): ${image.url.slice(0, 50)}...`)
    } else {
      recordQueueEvent(topic.title, 'failed_image')
      console.warn(`[MagazineGenerator] ⚠️ 히어로 이미지 없음 — "${topic.title}" 발행 보류`)
      await notifySlack({ level: 'important', agent: 'CAFE_CRAWLER', title: '매거진 히어로 이미지 생성 실패', body: `제목: ${topic.title}\n카테고리: ${category}\n→ 이미지 없음, 발행 보류됩니다.` })
      continue
    }

    // 본문 이미지 (두 번째 컨텍스트)
    const bodyImageUrls = new Map<number, string>()
    let bodyImg = await generateMagazineImageByContext(ctxList[1])

    // distinctness 가드: 본문이 히어로와 동일/저해상이면 1회 재생성, 그래도 불량이면 본문 이미지 폐기
    if (bodyImg) {
      const verdict = await flagBodyImage(image.url, bodyImg.url)
      if (verdict.flagged) {
        console.warn(`[MagazineGenerator] ⚠️ 본문 이미지 불량(${verdict.reason}) — 1회 재생성 시도: "${topic.title}"`)
        const retry = await generateMagazineImageByContext(ctxList[1])
        const retryOk = retry ? !(await flagBodyImage(image.url, retry.url)).flagged : false
        if (retry && retryOk) {
          bodyImg = retry
          console.log(`[MagazineGenerator] 본문 이미지 재생성 성공`)
        } else {
          // 재생성도 불량/실패 → 본문 이미지 없이 발행 (히어로는 유지, 발행 롤백 안 함)
          bodyImg = null
          console.warn(`[MagazineGenerator] ⚠️ 본문 이미지 재생성 실패 — 본문 이미지 없이 발행 (${verdict.reason})`)
          await notifySlack({ level: 'important', agent: 'CAFE_CRAWLER', title: '매거진 본문 이미지 중복/저해상 — 본문 이미지 없이 발행', body: `제목: ${topic.title}\n사유: ${verdict.reason}\n→ 히어로 1장만으로 발행됩니다(발행은 정상 진행).` })
        }
      }
    }

    if (bodyImg) {
      bodyImageUrls.set(1, bodyImg.url)
      console.log(`[MagazineGenerator] 본문 이미지 1 (${ctxList[1].type}, ${bodyImg.source}): ${bodyImg.url.slice(0, 50)}...`)
    } else {
      console.warn(`[MagazineGenerator] ⚠️ 본문 이미지 없음 — "${topic.title}" (<!-- [IMAGE:1] --> 플레이스홀더 제거됨)`)
    }

    // 리치 HTML 템플릿으로 최종 콘텐츠 빌드
    const sections = parseSectionsFromAI(article.content)
    const todayDate = new Date()
    const kstDate = new Date(todayDate.getTime() + 9 * 60 * 60 * 1000)
    const dateStr = kstDate.toISOString().split('T')[0]

    const templateData = {
      title: article.title,
      subtitle: article.summary ?? '',
      category,
      heroImageUrl: image?.url,
      heroAlt: ctxList[0].altKo,
      readingTime: Math.ceil(article.content.length / 500),
      sections,
      authorName: '우나어 매거진 편집팀',
      publishedDate: dateStr,
    }
    // editorial v2 — flag ON 시 v2 빌더. 실패 시 v1 fallback (발행 롤백 안 함)
    const editorialV2 = process.env.MAGAZINE_EDITORIAL_V2_ENABLED === 'true'
    let finalHtml: string
    if (editorialV2) {
      try {
        finalHtml = buildMagazineHtmlV2({ ...templateData, directAnswer: article.directAnswer, summaryPoints: article.summaryPoints })
      } catch (err) {
        console.warn('[MagazineGenerator] ⚠️ v2 빌드 실패 → v1 fallback:', err instanceof Error ? err.message : String(err))
        finalHtml = buildMagazineHtml(templateData)
      }
    } else {
      finalHtml = buildMagazineHtml(templateData)
    }

    // 본문 <!-- [IMAGE:N] --> 플레이스홀더를 실제 이미지로 치환
    for (const [n, url] of bodyImageUrls) {
      // n=1 → ctxList[1] (본문 이미지 context). out-of-bounds 방어: 마지막 ctx 사용
      const ctx = ctxList[n] ?? ctxList[ctxList.length - 1]
      const altText = ctx?.altKo ?? `${article.title} 관련 이미지`
      finalHtml = finalHtml.replace(
        `<!-- [IMAGE:${n}] -->`,
        `<img src="${url}" alt="${altText}" style="width:100%;height:auto;border-radius:12px;margin:16px 0;" loading="lazy" />`,
      )
    }
    // 생성되지 않은 나머지 플레이스홀더 제거 (잔존 시 경고)
    const remainingPlaceholders = finalHtml.match(/<!-- \[IMAGE:\d+\] -->/g)
    if (remainingPlaceholders && remainingPlaceholders.length > 0) {
      console.warn(`[MagazineGenerator] ⚠️ 미치환 이미지 플레이스홀더 ${remainingPlaceholders.length}개 제거됨:`, remainingPlaceholders)
    }
    finalHtml = finalHtml.replace(/<!-- \[IMAGE:\d+\] -->/g, '')
    // IMAGE_PROMPT 텍스트 잔존 방어 (AI가 예상 외 위치에 출력한 경우)
    finalHtml = finalHtml.replace(/\[IMAGE_PROMPT:[^\]]*\]/g, '')

    // 썸네일 = 히어로 이미지 직접 사용 (별도 Playwright 생성 불필요)
    const thumbnailUrl: string | undefined = image?.url

    // 본문 길이 검증 — 1500자 미만이면 발행 건너뜀
    const textLength = finalHtml.replace(/<[^>]*>/g, '').trim().length
    if (textLength < 1500) {
      await notifySlack({
        level: 'important',
        agent: 'MAGAZINE_GENERATOR',
        title: '⚠️ 매거진 본문 미달',
        body: `"${article.title}" — ${textLength}자 (기준 1500자)\n→ 본문 미달, 발행 건너뜀`,
      })
      recordQueueEvent(topic.title, 'failed_body_short')
      console.warn(`[MagazineGenerator] ⚠️ 본문 짧음(${textLength}자, 기준 1500자) — 발행 건너뜀: "${article.title}"`)
      continue
    }

    // 리치 HTML을 게시 콘텐츠로 사용
    const richArticle = { ...article, content: finalHtml }
    const seriesMeta = seriesMetaMap.get(topic.title)
    const { id: postId, slug: postSlug } = await publishMagazine(richArticle, category, thumbnailUrl, seriesMeta)

    // 발행 후 QA — Slack warning only (발행은 이미 완료)
    await postPublishQA({ ...richArticle, thumbnailUrl }, category)

    // Google 인덱싱 요청 (환경변수 미설정 시 자동 skip)
    const postUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.age-doesnt-matter.com'}/magazine/${postSlug}`
    await requestGoogleIndexing(postUrl).catch(err => console.warn('[Indexing] 실패 (무시):', err))

    // CPS 상품 매칭 + 저장
    try {
      const cpsProducts = await matchCpsProducts(category, article.title, article.content)
      if (cpsProducts.length > 0) {
        await saveCpsLinks(postId, cpsProducts)
        totalCpsCount += cpsProducts.length
        console.log(`[MagazineGenerator] CPS ${cpsProducts.length}개 매칭: ${cpsProducts.map(p => p.productName).join(', ')}`)
      }
    } catch (err) {
      console.warn('[MagazineGenerator] CPS 매칭 실패 (무시):', err)
    }

    publishedCount++
    publishedTitles.push(article.title)
    publishedResults.push({ title: article.title, category, postId, heroImageSource: image.source })
    // 발행 성공 후에만 published + postId를 state에 기록(소비 확정)
    recordQueueEvent(topic.title, 'published', postId)
    console.log(`[MagazineGenerator] 발행: "${article.title}" (${postId}) — 히어로 ${image ? `1장(${image.source})` : '없음'} + 본문 ${bodyImageUrls.size}장`)

    // 세션당 발행 한도(큐 모드 1편) 도달 시 중단 — missed slot 보충 없음
    if (publishedCount >= sessionPublishCap) break
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'COO',
      action: 'MAGAZINE_GENERATE',
      status: publishedCount > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        topicsAvailable: magazineTopics.length,
        published: publishedCount,
        titles: publishedTitles,
        cpsMatched: totalCpsCount,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  if (publishedCount > 0) {
    await notifySlack({
      level: 'info',
      agent: 'MAGAZINE_GENERATOR',
      title: '매거진 자동 발행',
      body: `${publishedCount}편 발행 완료\n${publishedTitles.map(t => `• ${t}`).join('\n')}`,
    })
  }

  console.log(`[MagazineGenerator] 완료 — ${publishedCount}편 발행, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
  return publishedResults
}

// 직접 실행 시에만 main() 호출 (import 시 자동 실행 방지)
const isDirectRun = process.argv[1]?.includes('magazine-generator')
if (isDirectRun) {
  main().catch(async (err) => {
    console.error('[MagazineGenerator] 치명적 오류:', err)
    await notifySlack({
      level: 'critical',
      agent: 'MAGAZINE_GENERATOR',
      title: '매거진 생성 실패',
      body: err instanceof Error ? err.message : String(err),
    })
    await disconnect()
    process.exit(1)
  })
}
