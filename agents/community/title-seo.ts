/**
 * 커뮤니티 글 제목 "자연스러운 네이버 SEO" 다듬기 (본문 절대 불변)
 *
 * - 강도: 보수적(A) — 원문 말투·길이 최대 존중. 본문에 실제 있는 검색어 1개만 자연 노출.
 * - 이미지 전용 글(본문 글자<50자): AI 없이 정규식 정리만.
 * - fact-guard(introducesUnsourcedFact): 본문/제목에 없는 숫자·영문·고유명사(씨/님) 주입 시 원문 폴백.
 * - 길이/금지어/에러 시에도 원문 제목 그대로 반환(폴백) — 절대 본문/사실을 바꾸지 않는다.
 *
 * 비용 정책(2026-07-08, S4):
 * - pre-filter: AI가 필요 없는 제목은 호출 없이 원문 유지(skip) 또는 정규식 정리(rule) → Opus/Sonnet 호출 자체 생략.
 * - 모델 기본 = Sonnet(CLAUDE_MODEL_HEAVY). Opus(STRATEGIC)는 TITLE_SEO_USE_OPUS=true 일 때만. Haiku 미사용.
 * - 본문 입력 700자로 축소(제목 키워드는 본문 초반 집중).
 *
 * 호출: sheet-scraper.ts (SHEET_TITLE_SEO=true 이고 시트 C열 수동 제목이 없을 때만)
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYS_TEXT = `당신은 50~60대 커뮤니티 글의 제목을 네이버 검색에 잘 걸리게 "아주 보수적으로" 다듬는 편집자입니다.
규칙:
- 원문 제목의 말투·길이·문장구조를 최대한 보존한다. 문장을 새로 쓰지 말고 최소한만 손질한다.
- 검색 키워드는 본문에 "글자 그대로" 등장한 단어 1개만 자연스럽게 드러낸다. 본문에 없는 단어/사실은 절대 추가 금지.
- 이미 제목이 자연스럽고 검색어가 있으면 원문을 그대로 반환한다.
- 마케팅/낚시 단어(총정리/완벽정리/방법/BEST/TOP) 금지, 이모지 추가 금지, 1인칭 커뮤니티 말투 유지.
- 제목 한 줄만 출력. 따옴표·설명·접두어 없이.`

const MAX_TITLE_LEN = 45
const BODY_INPUT_LEN = 700 // S4: 1500→700 (제목 키워드는 본문 초반 집중)
const BANNED = ['총정리', '완벽정리', '베스트', 'BEST', 'TOP5', 'TOP 5', '꿀팁', '클릭']

function stripText(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 정규식 정리 — 특수문자/말줄임/중복기호/파일명 잔재 제거 (AI 없이 안전한 표층 정리만, 띄어쓰기 교정 안 함) */
function ruleClean(t: string): string {
  return t
    .replace(/\.(jpg|jpeg|png|gif|webp)\b/gi, '')          // 파일명 잔재 .jpg 등
    .replace(/(?:[.]{2,}|…)+\s*$/g, '')                     // 끝 말줄임 ... …
    .replace(/([!?])\1{1,}\s*$/g, '$1')                     // 끝 !!!/??? → 1개
    .replace(/([ㄷㅠㅜㅋㅎ@~;])\1{2,}/g, '$1$1')            // ㄷㄷㄷ/ㅠㅠㅠ/~~~/;;;; 과다 → 2개
    .replace(/^[\s"'“”⭐★🎉🍗@#*]+|[\s"'“”⭐★🎉🍗@#*]+$/g, '') // 앞뒤 특수문자/이모지
    .replace(/\s{2,}/g, ' ')                                // 중복 공백
    .trim()
}

/** 종결어미/문장부호로 끝나 "완결"된 제목인지 — 완결이면 정보 보강(AI) 불필요 */
function endsProperly(t: string): boolean {
  return /(?:다|요|까|네|죠|음|함|봐|죠|나요|세요)$/.test(t) || /[?!]$/.test(t)
}

/** 출력 제목이 본문/제목에 없는 사실(숫자·영문·고유명사 씨/님)을 새로 끌어왔는지 — 있으면 폴백 */
function introducesUnsourcedFact(out: string, allowedNorm: string): boolean {
  for (const n of out.match(/\d+/g) ?? []) {
    if (!allowedNorm.includes(n)) return true
  }
  for (const w of out.match(/[A-Za-z]{2,}/g) ?? []) {
    if (!allowedNorm.includes(w.toLowerCase())) return true
  }
  for (const p of out.match(/[가-힣]{2,4}(?:씨|님)/g) ?? []) {
    if (!allowedNorm.includes(p.replace(/\s+/g, '').toLowerCase())) return true
  }
  return false
}

/**
 * 제목 SEO 다듬기. 위반·에러·빈값이면 원문 제목 그대로 반환.
 * @param rawTitle 원문 제목
 * @param content  본문 HTML (키워드 참고용 — 출력은 제목만, 본문은 절대 안 바뀜)
 * @param isImage  이미지 전용 글 여부(본문 글자<50자) — true면 AI 없이 정규식 정리만
 */
export async function polishTitleForSeo(
  rawTitle: string,
  content: string,
  isImage: boolean,
): Promise<string> {
  const title = (rawTitle ?? '').trim()
  if (!title) return rawTitle

  // ── pre-filter: AI 호출 없이 처리 가능한 제목 걸러내기 ──
  const cleaned = ruleClean(title)
  const hadEllipsis = /[.]{2,}|…/.test(title)
  // AI(Sonnet) 필요 조건: 이미지글 아님 + (원문 말줄임인데 정리 후에도 미완결) 또는 (짧은 미완결 명사구)
  const needsAI = !isImage && (
    (hadEllipsis && !endsProperly(cleaned)) ||
    (cleaned.length < 12 && !endsProperly(cleaned))
  )

  if (!needsAI) {
    if (cleaned !== title) {
      console.log(`[title-seo] rule: "${title}" → "${cleaned}"`)   // ruleCleaned
      return cleaned || title
    }
    // console.log 생략 가능하지만 aiSkipped 관찰용으로 짧게 남김 (제목만)
    console.log(`[title-seo] skip: "${title}"`)                     // aiSkipped
    return title
  }

  // ── AI 호출 경로: 기본 Sonnet, TITLE_SEO_USE_OPUS=true 일 때만 Opus ──
  const useOpus = process.env.TITLE_SEO_USE_OPUS === 'true'
  const model = useOpus
    ? (process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-7')
    : (process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6')
  const body = stripText(content)

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 60,
      system: SYS_TEXT,
      messages: [{
        role: 'user',
        content: `원문 제목: ${title}\n\n본문(키워드 참고용, 출력은 제목만):\n${body.slice(0, BODY_INPUT_LEN)}\n\n다듬은 제목:`,
      }],
    })

    let out = (res.content[0]?.type === 'text' ? res.content[0].text : '').trim()
    out = out.replace(/^["'\s]+|["'\s]+$/g, '')

    if (!out || out === title) return title
    if (out.length > MAX_TITLE_LEN) return title
    if (BANNED.some(b => out.includes(b))) return title

    const allowedNorm = (title + ' ' + body).replace(/\s+/g, '').toLowerCase()
    if (introducesUnsourcedFact(out, allowedNorm)) return title

    console.log(`[title-seo] ${useOpus ? 'opus' : 'sonnet'}: "${title}" → "${out}"`)  // sonnetUsed / opusUsed
    return out
  } catch (err) {
    console.warn(`[title-seo] 실패 — 원문 제목 유지: ${err instanceof Error ? err.message : String(err)}`)
    return title
  }
}
