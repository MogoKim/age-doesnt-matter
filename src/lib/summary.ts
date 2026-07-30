/**
 * 목록 미리보기(Post.summary) 생성 — src 런타임 단일 진입점.
 *
 * 배경: summary 생성이 경로마다 흩어져 있었다. 사용자 작성·가입인사는 각자
 * `stripHtmlTags(...).slice(0, 97)`을 복사해 썼고, 봇 API는 summary를 아예 넣지 않아
 * null을 만들었다. 크롤·백필만 agents/core/summary.ts의 buildSummary를 쓰고 있었다.
 * 그 결과 같은 목록 화면에 서로 다른 규칙으로 만든 미리보기가 섞였다
 * (2026-07-30 실측: 미리보기에 URL이 그대로 노출된 글 6건).
 *
 * ⚠️ agents/core/summary.ts를 import하지 않고 여기에 별도로 둔다.
 *   - `.vercelignore`가 `/agents/`를 배포에서 제외한다
 *   - `tsconfig.json` exclude에도 `agents`가 있다
 *   - 반대로 agents → src 런타임 import는 `.claude/rules/agents.md`가 금지한다(GHA ESM 실패)
 *   양방향이 모두 막혀 있어, 런타임별로 같은 계약을 각자 구현한다.
 *   두 구현이 어긋나지 않도록 src/__tests__/summary-contract.test.ts가 출력 일치를 검증한다.
 *
 * agents판과 의도적으로 다른 점 — normalizeSourceReferences를 쓰지 않는다.
 *   그 함수는 "82쿡" → "우나어"처럼 외부 사이트명을 우리 문맥으로 바꾼다. 크롤 원문을
 *   재발행할 때는 맞지만, 회원이 직접 "82쿡에서 봤는데"라고 쓴 글에 적용하면 회원의
 *   말을 왜곡한다. 그래서 src판은 출처 꼬리표·URL 제거까지만 한다.
 */

/** 제로폭 공백·BOM — trim()으로 지워지지 않아 미리보기에 그대로 남는다. */
const ZERO_WIDTH = /[​-‍⁠﻿]/g

/** 우리가 뜻을 아는 엔티티. 목록에 없는 것(&hellip; 등)은 공백으로 떨어뜨린다. */
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
 *
 * `src/lib/sanitize.ts`의 stripHtmlTags와 다르다. 그쪽은 태그를 빈 문자열로 지워
 * `<p>가</p><p>나</p>`가 "가나"로 붙고, 제로폭 공백과 엔티티도 그대로 남는다.
 * 미리보기에는 그 차이가 그대로 보이므로 여기서는 공백으로 치환하고 함께 정리한다.
 * (stripHtmlTags 자체는 본문 길이 검증 등 다른 용도로 계속 쓰인다.)
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  let text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
  // 닫히지 않은 script/style도 방어
  text = text.replace(/<(script|style)\b[\s\S]*$/gi, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  // 순서 주의: 모르는 엔티티를 먼저 걷어내고 그다음에 디코드한다(위 UNKNOWN_ENTITY 주석 참조)
  text = text.replace(UNKNOWN_ENTITY, ' ')
  for (const [re, ch] of NAMED_ENTITIES) text = text.replace(re, ch)
  return text.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim()
}

/** 문장 끝 출처 꼬리표. 뒤쪽 40자로 제한해 본문 한가운데의 "출처" 언급을 지키지 않는다. */
const TAIL_SOURCE = /\s*(출처|자료\s*출처|원문)\s*[:：]?\s*[^]{0,40}$/

/** "출처 + URL"은 위치를 가리지 않고 지운다 — 출처 표기가 분명해 본문이 상하지 않는다. */
const SOURCE_URL_ANYWHERE = /(출처|자료\s*출처|원문)\s*[:：]?\s*(https?:\/\/|www\.)\S+/gi

/**
 * 출처를 뜻하는 초성 은어. URL이 따라오거나 문자열 끝일 때만 지운다 —
 * "ㅊㅊ해요"(추천) 같은 일반 사용은 남긴다.
 */
const SLANG_SOURCE_URL = /\s*ㅊㅊ\s*[:：]?\s*(?:https?:\/\/|www\.)\S+/gi
const SLANG_SOURCE_TAIL = /\s*ㅊㅊ\s*[:：]?\s*$/

/** 괄호로 묶인 무특정 출처. 괄호 안 20자 이하일 때만 — 긴 괄호 주석은 보존. */
const PAREN_SOURCE = /\s*[（(]\s*(?:자료|그림|사진)?\s*출처\s*[:：]?\s*[^)）]{0,20}[)）]/g

/**
 * 위치를 가리지 않는 URL.
 *
 * 회원이 본문에 넣은 링크도 미리보기에서는 지운다. 목록에서 URL은 읽히지 않고,
 * 앞에 오면 정작 보여줄 문장을 밀어낸다. **본문(content)은 그대로 두므로
 * 상세 페이지에서는 링크가 그대로 보인다.**
 */
const URL_ANYWHERE = /\s*(?:https?:\/\/|www\.)\S+/gi

/**
 * 스킴 없이 도메인만 남은 링크카드 흔적("…그거 생각난다 instiz.net").
 * 실제로 관측된 도메인만 나열한다 — 모든 도메인을 지우려 하지 않는다.
 */
const LINK_CARD_DOMAIN =
  /\s*\b(?:m\.)?(?:instiz\.net|blog\.naver\.com|n\.news\.naver\.com|naver\.me|cafe\.daum\.net|cafe\.naver\.com|goodgag\.net|youtube\.com|youtu\.be|threads\.com|chosun\.com|x\.com)(?:\/\S*)?/gi

/**
 * 본문 중간의 "출처: 매체명" 표기. 콜론을 필수로 둬서
 * "이 자료의 출처를 찾다가"처럼 조사가 붙는 일반 문장은 건드리지 않는다.
 */
const MIDDLE_SOURCE_LABEL =
  /\s*(?:자료\s*|그림\s*|사진\s*)?출처\s*[:：]\s*[^\s|｜]{1,20}(?:\s*[|｜]\s*[^\s|｜]{1,20})*/g

/**
 * 미리보기에서만 출처·링크 표기를 걷어낸다. content는 그대로 둔다.
 *
 * 적용 순서가 중요하다. 중간 출처 규칙을 꼬리 정리보다 뒤에 둬야
 * "출처: 네이버 카페"처럼 공백이 든 매체명이 꼬리 규칙에서 통째로 처리된다.
 */
function stripSourceMarkers(text: string): string {
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

  // 1) 출처 라벨이 분명한 것부터 — 라벨과 URL을 함께 지운다
  let t = squash(text.replace(SOURCE_URL_ANYWHERE, ' '))
  t = squash(t.replace(SLANG_SOURCE_URL, ' '))
  t = squash(t.replace(PAREN_SOURCE, ' '))

  // 2) 라벨 없이 남은 링크
  t = squash(t.replace(URL_ANYWHERE, ' '))
  t = squash(t.replace(LINK_CARD_DOMAIN, ' '))

  // 3) 꼬리 정리 — 공백 든 매체명("출처: 네이버 카페")은 여기서 먹는다
  for (let i = 0; i < 3; i++) {
    const before = t
    t = t.replace(TAIL_SOURCE, '').trim()
    if (t === before) break
  }
  t = squash(t.replace(SLANG_SOURCE_TAIL, ' '))

  // 4) 꼬리가 아닌 중간 출처
  t = squash(t.replace(MIDDLE_SOURCE_LABEL, ' '))

  return t
}

/** 목록 미리보기 상한. 초과하면 97자 + '...' (기존 규칙 유지) */
const MAX_LEN = 100

/**
 * 목록 미리보기 문자열.
 *
 * 텍스트가 없으면(이미지·영상뿐인 글, 링크만 있는 글) null을 반환해 미리보기를
 * 렌더하지 않게 한다 — 빈 문자열로 두면 화면에 빈 줄이 생긴다.
 * 100자 컷은 출처·링크를 걷어낸 뒤에 한다. 먼저 자르면 지워질 것이 자리를 차지한다.
 */
export function buildSummary(html: string): string | null {
  const plain = htmlToPlainText(html)
  if (!plain) return null
  const text = stripSourceMarkers(plain)
  if (!text) return null
  return text.length > MAX_LEN ? text.slice(0, MAX_LEN - 3) + '...' : text
}
