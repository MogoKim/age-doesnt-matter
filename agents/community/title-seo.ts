/**
 * 커뮤니티 글 제목 "자연스러운 네이버 SEO" 다듬기 (본문 절대 불변)
 *
 * - 강도: 보수적(A) — 원문 말투·길이 최대 존중. 본문에 실제 있는 검색어 1개만 자연 노출.
 * - 이미지 전용 글(본문 글자<50자): 본문 참고 끄고 제목 군더더기만 정리.
 * - fact-guard(detectSourceOnlyFacts 방식): 본문/제목에 없는 숫자·영문·고유명사(씨/님) 주입 시 원문 폴백.
 * - 길이/금지어/에러 시에도 원문 제목 그대로 반환(폴백) — 절대 본문/사실을 바꾸지 않는다.
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

const SYS_IMG = `당신은 50~60대 커뮤니티 이미지글의 제목을 다듬는 편집자입니다. 본문 텍스트가 거의 없습니다.
규칙: 제목의 군더더기(.jpg, 깨진 글자, 과한 특수문자)만 정리하고 주제어는 그대로 유지. 본문 정보가 없으니 새 단어/사실 추가 절대 금지. 이미 깔끔하면 원문 그대로. 제목 한 줄만 출력.`

const MAX_TITLE_LEN = 45
const BANNED = ['총정리', '완벽정리', '베스트', 'BEST', 'TOP5', 'TOP 5', '꿀팁', '클릭']

function stripText(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
 * @param isImage  이미지 전용 글 여부(본문 글자<50자) — true면 본문 참고 끔
 */
export async function polishTitleForSeo(
  rawTitle: string,
  content: string,
  isImage: boolean,
): Promise<string> {
  const title = (rawTitle ?? '').trim()
  if (!title) return rawTitle
  const body = stripText(content)

  try {
    const res = await client.messages.create({
      model: process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-7',
      max_tokens: 60,
      system: isImage ? SYS_IMG : SYS_TEXT,
      messages: [{
        role: 'user',
        content: isImage
          ? `원문 제목: ${title}\n다듬은 제목:`
          : `원문 제목: ${title}\n\n본문(키워드 참고용, 출력은 제목만):\n${body.slice(0, 1500)}\n\n다듬은 제목:`,
      }],
    })

    let out = (res.content[0]?.type === 'text' ? res.content[0].text : '').trim()
    out = out.replace(/^["'\s]+|["'\s]+$/g, '')

    if (!out || out === title) return title
    if (out.length > MAX_TITLE_LEN) return title
    if (BANNED.some(b => out.includes(b))) return title

    const allowedNorm = (title + ' ' + body).replace(/\s+/g, '').toLowerCase()
    if (introducesUnsourcedFact(out, allowedNorm)) return title

    console.log(`[title-seo] "${title}" → "${out}"`)
    return out
  } catch (err) {
    console.warn(`[title-seo] 실패 — 원문 제목 유지: ${err instanceof Error ? err.message : String(err)}`)
    return title
  }
}
