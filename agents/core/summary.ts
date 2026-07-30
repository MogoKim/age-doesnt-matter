import { normalizeSourceReferences } from '../cafe/normalize-source-references.js'

/**
 * 게시글 목록 미리보기(Post.summary) 생성.
 *
 * 배경: 크롤 유입 글(sourceUrl 있음)은 summary를 넣지 않아 목록·검색에서 미리보기가
 * 비어 있었다. 2026-07-30 조사 시점에 커뮤니티 4보드 7,269건 중 2,163건(30%)이
 * summary=null이었고, 그중 2,156건(100%)이 sourceUrl 있는 글이었다. 본문 텍스트는
 * 있는데 필드만 비어 있던 것이라(텍스트 없는 글은 조사 표본 2,000건 중 1건),
 * 사용자 작성 글과 같이 저장 시점에 본문에서 뽑아 채운다.
 *
 * ⚠️ agents/ → src/ 런타임 import 금지 규칙(.claude/rules/agents.md)에 따라
 * src/lib/sanitize.ts의 stripHtmlTags를 쓰지 않고 여기서 직접 정의한다.
 * normalizeSourceReferences는 agents/cafe 안에 있고 src 의존이 0이라 그대로 쓴다.
 *
 * 사용자 작성 경로(src/lib/actions/posts.ts)와 100자 규칙은 같지만, 텍스트 추출은
 * 아래 두 가지가 다르다 — 둘 다 실제 데이터에서 확인된 문제를 고친 것이다.
 *   1) 태그를 빈 문자열이 아니라 공백으로 치환한다.
 *      posts.ts의 stripHtmlTags는 <[^>]*> → '' 이므로 <p>가</p><p>나</p>가 "가나"로 붙는다.
 *   2) 제로폭 공백(U+200B 등)을 제거한다.
 *      trim()은 이를 공백으로 보지 않아, 운영 중인 사용자 글 미리보기에
 *      "오늘 설치했어요 <U+200B> <U+200B> <U+200B> 기사님가시고" 처럼 그대로 남아 있다.
 * 사용자 작성 경로에도 같은 문제가 있으나 그 수정은 이 변경의 범위가 아니다.
 */

/** 제로폭 공백·BOM — trim()으로 지워지지 않아 미리보기에 그대로 남는다. */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g

/** 우리가 뜻을 아는 엔티티. 이 목록에 없는 것(&hellip; 등)은 공백으로 떨어뜨린다. */
const NAMED_ENTITIES: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#0*39;|&apos;/gi, "'"],
  [/&amp;/gi, '&'], // 마지막 — 먼저 풀면 &amp;lt; 가 <로 이중 디코드된다
]

/**
 * 모르는 엔티티를 공백으로 떨어뜨리되, 위 목록은 건드리지 않는다.
 * 이 정리를 디코드 뒤에 하면 &amp;lt; → &lt; 로 푼 결과를 다시 삼켜 빈 문자열이 된다.
 */
const UNKNOWN_ENTITY = /&(?!nbsp;|lt;|gt;|quot;|apos;|amp;|#0*39;)([a-z]+|#\d+);/gi

/**
 * HTML → 순수 텍스트.
 * script/style은 태그만 지우면 코드 본문이 텍스트로 남으므로 블록째 제거한다.
 * (onerror 등 이벤트 핸들러는 속성이라 태그 제거로 함께 사라진다.)
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  let text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  // 닫히지 않은 script/style도 방어 (크롤 원문이 깨져 오는 경우)
  text = text.replace(/<(script|style)\b[\s\S]*$/gi, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  // 순서 주의: 모르는 엔티티를 먼저 걷어내고 그다음에 디코드한다(위 UNKNOWN_ENTITY 주석 참조)
  text = text.replace(UNKNOWN_ENTITY, ' ')
  for (const [re, ch] of NAMED_ENTITIES) text = text.replace(re, ch)
  return text.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim()
}

/**
 * 문장 끝에 붙은 출처 꼬리표. 크롤 원문은 "…버거킹도 변하네요 ㅠ 출처: 네이버 카페"처럼
 * 본문 끝에 출처를 달고 온다. 콜론이 없는 형태("출처 https://x.com/…")도 있다.
 * 뒤쪽 40자로 제한해 본문 한가운데의 "출처" 언급까지 잘라내지 않는다.
 */
const TAIL_SOURCE = /\s*(출처|자료\s*출처|원문)\s*[:：]?\s*[^]{0,40}$/
/** 문장 끝 URL — 본문 중간 인용 URL은 건드리지 않는다. */
const TAIL_URL = /\s*(https?:\/\/|www\.)\S*\s*$/i

/**
 * "출처 + URL"이 붙은 형태는 위치를 가리지 않고 지운다.
 * 실데이터에서 꼬리표보다 머리표가 더 많았다 —
 * "출처 https://instiz.net/pt/78523 강아지랑…"처럼 앞에 와서 정작 본문을 밀어낸다.
 * 출처 뒤 URL은 어느 위치에 있든 출처 표기가 분명하므로 제거해도 본문이 상하지 않는다.
 */
const SOURCE_URL_ANYWHERE = /(출처|자료\s*출처|원문)\s*[:：]?\s*(https?:\/\/|www\.)\S+/gi

/**
 * 미리보기에서만 출처 표기를 걷어낸다. 본문(content)은 그대로 둔다 —
 * 상세 페이지의 출처 표기는 유지해야 한다.
 * 표기가 둘 이상 겹칠 수 있어(예: "… 출처: 펨코 https://…") 반복 적용한다.
 */
function stripTailSource(text: string): string {
  let t = text.replace(SOURCE_URL_ANYWHERE, ' ').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3; i++) {
    const before = t
    t = t.replace(TAIL_URL, '').replace(TAIL_SOURCE, '').trim()
    if (t === before) break
  }
  return t
}

/**
 * 목록 미리보기 문자열. 텍스트가 없으면(이미지·영상뿐인 글, 또는 출처 문구만 있던 글)
 * null을 반환해 미리보기를 렌더하지 않게 한다 — 빈 문자열로 두면 화면에 빈 줄이 생긴다.
 *
 * 출처 처리(2026-07-30):
 * 백필 대상 2,275건 전수 dry-run에서 285건(13%)의 미리보기에 원본 사이트명이
 * 그대로 노출되는 것이 확인됐다("출처: 펨코" 93건 등). PR #141에서 창업자 승인으로
 * 종결한 P0 이슈가 목록 미리보기로 재발하는 셈이라, 두 단계로 막는다.
 *   1) normalizeSourceReferences — 사이트명을 '온라인 커뮤니티'로 일반화(#141과 같은 규칙)
 *   2) stripTailSource          — 미리보기에서 꼬리표 자체를 제거
 * 전수 시뮬레이션: 285건 → 4건, 출처만 있던 글 121건은 미리보기 없음으로 남는다.
 *
 * 100자 컷은 꼬리표를 걷어낸 뒤에 한다. 먼저 자르면 "출처: 온라인 커뮤니티"(12자)가
 * 자리를 차지해 정작 보여줄 첫 문장이 밀려난다.
 *
 * 100자 규칙은 사용자 작성 경로와 동일: 초과 시 97자 + '...'.
 */
export function buildSummary(html: string): string | null {
  const plain = htmlToPlainText(html)
  if (!plain) return null
  // 사이트명 일반화는 원문 텍스트 기준으로 한 번만 — 결과의 replacements/flags는 여기선 쓰지 않는다.
  const normalized = normalizeSourceReferences(plain).text
  const text = stripTailSource(normalized)
  if (!text) return null
  return text.length > 100 ? text.slice(0, 97) + '...' : text
}
