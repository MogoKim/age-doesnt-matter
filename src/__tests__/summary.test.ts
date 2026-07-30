import { describe, it, expect } from 'vitest'
import { buildSummary, htmlToPlainText } from '@/lib/summary'

/**
 * src 런타임 미리보기 생성 계약 고정. DB/네트워크 없이 순수 함수만 검증.
 *
 * 배경: 사용자 작성·가입인사가 각자 `stripHtmlTags(...).slice(0, 97)`을 복사해 쓰고,
 * 봇 API는 summary를 아예 넣지 않아 목록 미리보기 규칙이 경로마다 달랐다.
 * 이 파일은 통합된 규칙이 다시 갈라지지 않게 막는다.
 */

describe('htmlToPlainText — sanitize.stripHtmlTags와 다른 지점', () => {
  it('블록 태그 경계에서 단어가 붙지 않는다', () => {
    // stripHtmlTags는 태그를 ''로 지워 "가나"가 된다 — 여기선 공백 유지
    expect(htmlToPlainText('<p>가</p><p>나</p>')).toBe('가 나')
  })

  it('제로폭 공백(U+200B)을 제거한다', () => {
    expect(htmlToPlainText('<p>오늘​ ​설치했어요</p>')).toBe('오늘 설치했어요')
  })

  it('HTML 엔티티를 디코드한다', () => {
    expect(htmlToPlainText('<p>가&nbsp;나</p>')).toBe('가 나')
    expect(htmlToPlainText('<p>3 &lt; 5</p>')).toBe('3 < 5')
    expect(htmlToPlainText('<p>&quot;인용&quot;</p>')).toBe('"인용"')
  })

  it('&amp;를 이중 디코드하지 않는다', () => {
    expect(htmlToPlainText('<p>&amp;lt;태그&amp;gt;</p>')).toBe('&lt;태그&gt;')
  })

  it('알 수 없는 엔티티는 공백으로 떨어뜨린다', () => {
    expect(htmlToPlainText('<p>말줄임&hellip;끝</p>')).toBe('말줄임 끝')
  })

  it('script/style 블록의 코드가 텍스트로 남지 않는다', () => {
    expect(htmlToPlainText('<p>안녕</p><script>alert(1)</script>')).toBe('안녕')
    expect(htmlToPlainText('<style>.a{color:red}</style><p>본문</p>')).toBe('본문')
  })

  it('닫히지 않은 script도 잘라낸다', () => {
    expect(htmlToPlainText('<p>본문</p><script>alert(1)')).toBe('본문')
  })

  it('연속 공백·개행을 한 칸으로 정규화하고 앞뒤를 자른다', () => {
    expect(htmlToPlainText('  <p>가  나\n\n다</p>  ')).toBe('가 나 다')
  })
})

describe('buildSummary — 100자 규칙', () => {
  it('100자 이하는 그대로 둔다', () => {
    const body = '가'.repeat(100)
    expect(buildSummary(`<p>${body}</p>`)).toBe(body)
  })

  it('100자를 넘으면 97자 + ...', () => {
    const body = '가'.repeat(120)
    const r = buildSummary(`<p>${body}</p>`)
    expect(r).toBe('가'.repeat(97) + '...')
    expect(r).toHaveLength(100)
  })

  it('출처를 걷어낸 뒤에 100자를 센다', () => {
    // 먼저 자르면 지워질 꼬리표가 자리를 차지해 본문이 밀려난다
    const body = '가'.repeat(100)
    expect(buildSummary(`<p>${body} 출처: 펨코</p>`)).toBe(body)
  })
})

describe('buildSummary — 텍스트 없는 글은 null', () => {
  it('이미지뿐이면 null (미리보기 미렌더 → 빈 줄 방지)', () => {
    expect(buildSummary('<p><img src="https://img.example.com/a.webp"></p>')).toBeNull()
  })

  it('빈 문단·공백·제로폭만 있으면 null', () => {
    expect(buildSummary('<p></p><p>​</p>')).toBeNull()
    expect(buildSummary('')).toBeNull()
  })

  it('이미지와 텍스트가 함께면 텍스트를 뽑는다', () => {
    expect(buildSummary('<p><img src="https://img.example.com/a.webp">사진 올려요</p>')).toBe('사진 올려요')
  })
})

describe('buildSummary — 회원이 넣은 URL', () => {
  it('문장 끝 URL을 제거한다', () => {
    expect(buildSummary('<p>이 기사 보세요 https://n.news.naver.com/article/001</p>')).toBe('이 기사 보세요')
  })

  it('머리에 온 URL이 본문을 밀어내지 않는다', () => {
    expect(buildSummary('<p>https://youtube.com/shorts/abc 쇼츠에 떠서 해봤는데 되네요</p>')).toBe(
      '쇼츠에 떠서 해봤는데 되네요'
    )
  })

  it('문장 중간에 끼어든 URL을 제거한다', () => {
    expect(buildSummary('<p>다니던 정형외과에서 https://www.threads.com/@a/post/DZ 도수치료실 없앤대요</p>')).toBe(
      '다니던 정형외과에서 도수치료실 없앤대요'
    )
  })

  it('URL만 있는 글이면 null', () => {
    expect(buildSummary('<p>https://petitions.assembly.go.kr/proceed/onGoingAll/525630</p>')).toBeNull()
    expect(buildSummary('<p>www.example.com</p>')).toBeNull()
  })

  it('URL을 지우고 남은 텍스트가 있으면 그 텍스트를 쓴다', () => {
    expect(buildSummary('<p>https://petitions.assembly.go.kr/proceed/onGoingAll/525630 동의해주세요</p>')).toBe(
      '동의해주세요'
    )
  })

  it('스킴 없는 링크카드 도메인도 제거한다', () => {
    expect(buildSummary('<p>충청 화법하니까 그거 생각난다 instiz.net</p>')).toBe('충청 화법하니까 그거 생각난다')
  })

  it('목록에 없는 일반 도메인 언급은 보존한다', () => {
    expect(buildSummary('<p>회사 메일이 example.co.kr 로 바뀌었어요</p>')).toBe('회사 메일이 example.co.kr 로 바뀌었어요')
  })
})

describe('buildSummary — 출처 표기', () => {
  it('문장 끝 출처 꼬리표를 제거한다', () => {
    expect(buildSummary('<p>가격이 올랐네요 출처: 펨코</p>')).toBe('가격이 올랐네요')
    expect(buildSummary('<p>신상 사먹었어요 출처: 네이버 카페</p>')).toBe('신상 사먹었어요')
  })

  it('괄호형 무특정 출처를 제거한다', () => {
    expect(buildSummary('<p>(자료출처:인터넷) 국민연금 월 167만원이 중요한 이유</p>')).toBe(
      '국민연금 월 167만원이 중요한 이유'
    )
  })

  it('출처 표기만 있으면 null', () => {
    expect(buildSummary('<p>출처: 펨코</p>')).toBeNull()
    expect(buildSummary('<p>(자료출처:인터넷)</p>')).toBeNull()
  })

  it('조사가 붙은 일반 문장의 "출처"는 보존한다', () => {
    const long = '이 자료의 출처를 찾다가 결국 원본을 못 찾았는데요 혹시 아시는 분 계신가요 정말 궁금해서 여쭤봅니다'
    expect(buildSummary(`<p>${long}</p>`)).toContain('출처를 찾다가')
  })

  it('출처 표기가 없는 정상 본문은 그대로 둔다', () => {
    expect(buildSummary('<p>고양이 합사해 보신 분 계신가요?</p>')).toBe('고양이 합사해 보신 분 계신가요?')
  })
})

describe('buildSummary — 출처 초성 은어 (ㅊㅊ)', () => {
  it('꼬리에 남은 "ㅊㅊ:"를 제거한다', () => {
    expect(buildSummary('<p>사자 갈기 숱이 적어진다고 ㅊㅊ:</p>')).toBe('사자 갈기 숱이 적어진다고')
  })

  it('"ㅊㅊ: URL" 형태를 통째로 제거한다', () => {
    expect(buildSummary('<p>좋은 글 ㅊㅊ: https://example.com/abc</p>')).toBe('좋은 글')
  })

  it('출처 은어만 있으면 null', () => {
    expect(buildSummary('<p>ㅊㅊ: https://example.com/abc</p>')).toBeNull()
  })

  it('추천 뜻으로 쓰인 "ㅊㅊ해요"는 보존한다', () => {
    expect(buildSummary('<p>이 영화 ㅊㅊ해요 정말 재밌었어요</p>')).toBe('이 영화 ㅊㅊ해요 정말 재밌었어요')
  })
})

describe('buildSummary — 회원 글의 외부 사이트명은 바꾸지 않는다', () => {
  it('agents판과 달리 "82쿡"을 "우나어"로 치환하지 않는다', () => {
    // agents/core/summary.ts는 크롤 원문 재발행이라 normalizeSourceReferences를 쓴다.
    // 회원이 직접 쓴 문장에 적용하면 회원의 말을 왜곡하므로 src판은 쓰지 않는다.
    expect(buildSummary('<p>82쿡에서 봤는데 이 방법이 좋대요</p>')).toBe('82쿡에서 봤는데 이 방법이 좋대요')
  })
})
