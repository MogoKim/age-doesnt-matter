/**
 * 콘텐츠 변환기 — 외부 HTML 정제 + 출처 표시 + 미디어 보존 + YouTube 변환
 */

import sanitize from 'sanitize-html'
import type { SiteConfig } from './site-configs.js'

/** sanitize-html 허용 규칙 */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'i', 'em', 'u', 'del', 's',
    'a', 'h2', 'h3', 'h4',
    'img',
    'iframe',
    'video', 'source',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'div', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow'],
    video: ['src', 'poster', 'controls', 'preload'],
    source: ['src', 'type'],
    div: ['class'],
    span: [],
  },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com'],
  allowedClasses: {
    div: ['source-attribution', 'image-placeholder'],
  },
}

/**
 * 외부 HTML을 우리 사이트용으로 변환
 */
export function transformContent(
  rawHtml: string,
  sourceUrl: string,
  siteConfig: SiteConfig,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2' = 'HUMOR',
): string {
  // 1. 불필요 요소 제거 (사이트별)
  let cleaned = rawHtml
  for (const selector of siteConfig.selectors.removeElements) {
    cleaned = removeElementsByPattern(cleaned, selector)
  }

  // 2. 사이트별 전처리 (sanitize 전)
  cleaned = preClean(cleaned, siteConfig)

  // 3. sanitize-html로 정제
  const sanitized = sanitize(cleaned, SANITIZE_OPTIONS)

  // 4. 사이트별 후처리 (sanitize 후)
  let processed = postClean(sanitized)

  // 5. YouTube 텍스트 URL → iframe 변환
  processed = convertYouTubeUrls(processed)

  // 6. video 태그에 controls 속성 주입
  processed = injectVideoControls(processed)

  // 7. 빈 태그 정리
  processed = cleanEmptyTags(processed)

  // 8. 출처 표시 — STORY(사는이야기)는 개인 글처럼 보이므로 출처 없음
  if (boardType === 'HUMOR') {
    processed = `${processed}\n<p>출처: ${escapeHtml(siteConfig.name)}</p>`
  }

  return processed
}

/**
 * raw_content(창업자 수동 붙여넣기)를 변환
 */
export function transformRawContent(
  rawContent: string,
  sourceUrl: string,
  siteName: string,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2' = 'HUMOR',
): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(rawContent)

  let content: string
  if (isHtml) {
    content = sanitize(rawContent, SANITIZE_OPTIONS)
    content = postClean(content)
    content = convertYouTubeUrls(content)
    content = injectVideoControls(content)
    content = cleanEmptyTags(content)
  } else {
    content = rawContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
      .join('\n')
  }

  // STORY(사는이야기)는 개인 글처럼 보여야 하므로 출처 없음
  if (boardType === 'HUMOR') {
    content = `${content}\n<p>출처: ${escapeHtml(siteName)}</p>`
  }

  return content
}

// ── 게시판별 카테고리 키워드 ──
// 라벨은 DB BoardConfig.categories(=실제 사이트 운영값)와 정확히 일치해야 한다.
//   STORY: 건강·가족·취미·고민·자유수다 / LIFE2: 은퇴준비·재테크·연금·보험·주거·이사 / HUMOR: 유머·웃음·엔터·TV·추천·리뷰·기타
// 분류 결과는 sheet-scraper에서 BoardConfig 유효 set과 한 번 더 대조 후, 비유효 시 게시판 기본값으로 폴백한다.
// '자유수다'(STORY)·'기타'(HUMOR)는 키워드를 두지 않고 폴백 기본값으로 처리한다.
// ⚠️ 부분 문자열 일치이므로 '약'·'집'·'돈' 같은 짧고 흔한 어절은 오탐(약속/집중/돈가스) 유발 → 금지. 구체 키워드만.

const STORY_KEYWORDS: Record<string, string[]> = {
  '건강': ['건강', '운동', '혈압', '혈당', '관절', '걷기', '식단', '병원', '수술', '다이어트', '허리', '무릎', '혈관', '영양제', '체중', '갱년기', '당뇨', '복용', '통증', '건강검진'],
  '가족': ['남편', '아내', '아들', '딸', '손주', '손녀', '며느리', '사위', '시댁', '친정', '가족', '자녀', '손자', '부모님', '시어머니', '장모', '형제', '자매', '명절', '육아'],
  '취미': ['취미', '여행', '등산', '산책', '그림', '노래', '악기', '독서', '텃밭', '화초', '반려견', '강아지', '고양이', '캠핑', '낚시', '골프', '요가', '공예', '뜨개'],
  // ⚠️ '사진' 제거(2026-06-16 P4): "사진찍었어요"(소비자 불만글 등)가 취미로 오분류되던 오탐어.
  '고민': ['고민', '걱정', '힘들', '스트레스', '불안', '외로', '우울', '상담', '조언', '속상', '어떡해', '답답', '괴로'],
}

const LIFE2_KEYWORDS: Record<string, string[]> = {
  '은퇴준비': ['은퇴', '퇴직', '노후', '인생2막', '제2막', '정년', '명예퇴직', '퇴사', '재취업', '제2의 인생'],
  '재테크·연금': ['연금', '재테크', '투자', '주식', '적금', '예금', '자산', '국민연금', '기초연금', '퇴직연금', '펀드', '배당', '노후자금', '목돈', '이자'],
  '보험': ['보험', '실비', '실손', '보장', '보험료', '종신보험', '암보험', '연금보험'],
  '주거·이사': ['이사', '전세', '월세', '아파트', '귀촌', '귀농', '주택', '매매', '분양', '집값', '전원주택', '이주'],
}

const HUMOR_KEYWORDS: Record<string, string[]> = {
  '유머·웃음': ['ㅋㅋ', '웃긴', '빵터', '레전드', '개웃', 'ㅎㅎ', '짤', '웃음', '유머', 'ㄷㄷ', '대박', 'ㅋㅋㅋ', '웃겨', '꿀잼'],
  '엔터·TV': ['드라마', '예능', '배우', '가수', '트로트', '방송', 'tv', '연예', '프로그램', '출연', '영화', '넷플릭스', '미스트롯', '임영웅', '오디션'],
  '추천·리뷰': ['추천', '강추', '꿀팁', '리뷰', '후기', '맛집', '소개', '제품', '구매', '써보니', '내돈내산'],
}

// ── 데모그래픽 부적합 마커 (P2 2026-06-16) ──
// 우나어는 50-60대 대상. 본인 임신·출산·산후·영아 육아 단계 글(20-30대)이 레몬테라스 등
// 젊은층 큰 카페에서 유입돼 봇이 "임신중에 대단" 식으로 또래처럼 공감하는 사고가 있었다.
// ⚠️ '손주'·'어린이집'·'유치원' 같은 조부모 맥락 모호어는 제외(오탐 방지).
//    50-60대가 '본인 1인칭'으로는 거의 쓰지 않는 임신/출산/산후 단계 단어만.
const YOUNG_DEMO_MARKERS = [
  '입덧', '임신중', '임신 중', '임신초기', '임신중기', '임신후기', '만삭', '태교',
  '산후조리', '산후우울', '모유수유', '임신성당뇨', '출산예정', '출산 예정', '육아휴직',
]

/** 20-30대 본인 임신·출산·육아 단계 글 감지 (50-60 커뮤니티 부적합) */
export function hasYoungDemographicMarker(text: string): boolean {
  const plain = text.replace(/<[^>]+>/g, ' ')
  return YOUNG_DEMO_MARKERS.some((m) => plain.includes(m))
}

/**
 * 카테고리 자동 분류 (게시판별 키워드 기반)
 * 매칭 없으면 '기타' 반환 → 호출부(sheet-scraper)에서 BoardConfig 유효성 검사 후 게시판 기본값으로 폴백.
 */
export function classifyCategory(
  title: string,
  content: string,
  boardType: 'STORY' | 'HUMOR' | 'LIFE2' = 'STORY',
): string {
  const text = `${title} ${content}`.toLowerCase()
  const keywords =
    boardType === 'HUMOR' ? HUMOR_KEYWORDS : boardType === 'LIFE2' ? LIFE2_KEYWORDS : STORY_KEYWORDS

  let bestCategory = '기타'
  let bestScore = 0

  for (const [category, kws] of Object.entries(keywords)) {
    const score = kws.filter((kw) => text.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
    }
  }

  return bestCategory
}

// ── 전처리: sanitize 전 외부 링크/wrapper 변환 ──

function preClean(html: string, siteConfig: SiteConfig): string {
  let result = html

  if (siteConfig.id === 'fmkorea') {
    // 펨코 link.php 리다이렉터 → 실제 URL 추출
    result = result.replace(
      /href="https?:\/\/link\.fmkorea\.org\/link\.php\?url=([^"&]+)[^"]*"/gi,
      (_, encoded) => `href="${decodeURIComponent(encoded)}"`,
    )

    // 펨코 rel="highslide" 이미지 확대 wrapper → 내부 콘텐츠만 남기기
    result = result.replace(/<a[^>]*rel=["']highslide["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

    // 펨코 auto_media_wrapper: 비디오만 추출, 나머지(플레이어 UI 텍스트) 제거
    result = stripVideoPlayerWrappers(result)

    // 펨코 비디오 플레이어 UI 요소 제거 (button, input, speed selector)
    result = result.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    result = result.replace(/<input[^>]*\/?>/gi, '')
  }

  if (siteConfig.id === 'natepann') {
    // 네이트판 /attach/imageView 이미지 뷰어 링크 → 내부 콘텐츠만 남기기
    result = result.replace(/<a[^>]*href="\/attach\/imageView[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1')
  }

  // 오유: <b> 태그가 본문 전체를 wrapping하는 패턴 제거
  // <p><b>전체 텍스트</b></p> 같은 구조에서 <b>를 제거
  if (siteConfig.id === 'todayhumor') {
    result = result.replace(/<b>([\s\S]*?)<\/b>/gi, '$1')
  }

  return result
}

// ── 후처리: sanitize 후 잔여 정리 ──

function postClean(html: string): string {
  let result = html

  // 남아있는 rel="highslide" 등 비표준 a wrapper 제거
  result = result.replace(/<a[^>]*rel=["']highslide["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 남아있는 /attach/imageView 링크 제거
  result = result.replace(/<a[^>]*href=["']\/attach\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // link.fmkorea.org 리다이렉터가 남아있으면 실제 URL로 변환
  result = result.replace(
    /<a[^>]*href=["']https?:\/\/link\.fmkorea\.org\/link\.php\?url=([^"'&]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, encoded, inner) => `<a href="${decodeURIComponent(encoded)}" target="_blank" rel="noopener noreferrer">${inner}</a>`,
  )

  // 비디오 플레이어 UI 잔해 제거 (펨코 MediaElement.js)
  result = result.replace(/Video Player/g, '')
  // 속도 셀렉터 리스트
  result = result.replace(/<ul>\s*(?:<li>\s*\d\.\d{2}x\s*<\/li>\s*)+<\/ul>/gi, '')
  result = result.replace(/<div>\s*\d\.\d{2}x\s*(?:<div>\s*<\/div>\s*)?<\/div>/gi, '')
  result = result.replace(/<div>\s*\/\s*<\/div>/gi, '')
  result = result.replace(/<div>\s*\d{1,2}:\d{2}\s*<\/div>/gi, '')
  result = result.replace(/<li>\s*\d\.\d{2}x\s*<\/li>/gi, '')
  result = result.replace(/<p>\s*\d\.\d{2}x\s*<\/p>/gi, '')

  return result
}

// ── 빈 태그 정리 ──

function cleanEmptyTags(html: string): string {
  return html
    // <p> 안에 실질적 콘텐츠 없는 경우 제거
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<p>\s*(?:<br\s*\/?>)\s*<\/p>/gi, '')
    .replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
    // <div> 안에 콘텐츠 없는 경우 제거 (source-attribution 제외)
    .replace(/<div>\s*<\/div>/gi, '')
    // 연속 br 3개 이상 → 2개로 줄임
    .replace(/(<br\s*\/?>[\s]*){3,}/gi, '<br><br>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// ── YouTube URL → iframe 변환 ──

/**
 * 텍스트/링크 형태의 YouTube URL을 iframe 임베드로 변환
 */
function convertYouTubeUrls(html: string): string {
  // Step 1: <a> 태그 안의 YouTube 링크를 iframe으로 교체
  const ytLinkRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi
  let result = html.replace(ytLinkRegex, (_match, _href, videoId) => {
    return makeYouTubeIframe(videoId)
  })

  // Step 2: 텍스트 내 bare YouTube URL을 iframe으로 교체
  const bareYtRegex = /(?<![="'])https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})(?:[^\s<]*)/g
  result = result.replace(bareYtRegex, (_match, videoId) => {
    return makeYouTubeIframe(videoId)
  })

  return result
}

function makeYouTubeIframe(videoId: string): string {
  return `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}" width="100%" height="400" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
}

// ── video 태그 controls 주입 ──

function injectVideoControls(html: string): string {
  return html.replace(/<video(?![^>]*controls)([^>]*)>/gi, '<video controls$1>')
}

// ── 유틸 ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 펨코 auto_media_wrapper에서 <video> 태그만 추출, 나머지(플레이어 UI) 제거
 * 중첩 div를 정확히 처리하기 위해 depth 카운팅 사용
 */
function stripVideoPlayerWrappers(html: string): string {
  const openPattern = /<div[^>]*class="[^"]*auto_media_wrapper[^"]*"[^>]*>/gi
  let openMatch
  const replacements: Array<[number, number, string]> = []

  while ((openMatch = openPattern.exec(html)) !== null) {
    const startIdx = openMatch.index
    let depth = 1
    let searchIdx = startIdx + openMatch[0].length

    while (depth > 0 && searchIdx < html.length) {
      const nextOpen = html.indexOf('<div', searchIdx)
      const nextClose = html.indexOf('</div>', searchIdx)

      if (nextClose === -1) break

      if (nextOpen !== -1 && nextOpen < nextClose && /^<div[\s>]/i.test(html.slice(nextOpen))) {
        depth++
        searchIdx = nextOpen + 4
      } else {
        depth--
        if (depth === 0) {
          const endIdx = nextClose + '</div>'.length
          const wrapperHtml = html.slice(startIdx, endIdx)
          // video 태그만 추출
          const videos = wrapperHtml.match(/<video[^>]*>[\s\S]*?<\/video>|<video[^>]*\/>/gi) || []
          replacements.push([startIdx, endIdx, videos.join('\n')])
        }
        searchIdx = nextClose + '</div>'.length
      }
    }
  }

  // 뒤에서부터 교체 (인덱스 보존)
  let result = html
  for (let i = replacements.length - 1; i >= 0; i--) {
    const [start, end, replacement] = replacements[i]
    result = result.slice(0, start) + replacement + result.slice(end)
  }

  return result
}

/**
 * CSS 셀렉터 패턴으로 HTML 요소 제거 (간이 구현)
 */
function removeElementsByPattern(html: string, selector: string): string {
  // iframe:not([src*="youtube"]) 패턴
  const notMatch = selector.match(/^(\w+):not\(\[src\*="([^"]+)"\]\)$/)
  if (notMatch) {
    const tag = notMatch[1]
    const keep = notMatch[2]
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>|<${tag}[^>]*\\/?>`, 'gi')
    return html.replace(regex, (match) => (match.includes(keep) ? match : ''))
  }

  // .클래스명 패턴
  if (selector.startsWith('.')) {
    const cls = selector.slice(1)
    const regex = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi')
    return html.replace(regex, '')
  }

  // 태그명 패턴
  if (/^\w+$/.test(selector)) {
    const regex = new RegExp(`<${selector}[^>]*>[\\s\\S]*?<\\/${selector}>|<${selector}[^>]*\\/?>`, 'gi')
    return html.replace(regex, '')
  }

  return html
}
