import { describe, it, expect } from 'vitest'
import { buildSummary, htmlToPlainText } from '../../agents/core/summary'

/**
 * 크롤 유입 글 미리보기(Post.summary) 생성 계약 고정. DB/네트워크 없이 순수 함수만 검증.
 * 배경: sheet-scraper가 summary를 넣지 않아 크롤 글 미리보기가 전부 비어 있었다.
 */

describe('htmlToPlainText — 태그 제거', () => {
  it('블록 태그 경계에서 단어가 붙지 않는다', () => {
    // src/lib/sanitize.ts의 stripHtmlTags는 태그를 ''로 지워 "가나"가 된다 — 여기선 공백 유지
    expect(htmlToPlainText('<p>가</p><p>나</p>')).toBe('가 나')
    expect(htmlToPlainText('첫줄<br>둘째줄')).toBe('첫줄 둘째줄')
    expect(htmlToPlainText('<li>사과</li><li>배</li>')).toBe('사과 배')
  })

  it('연속 공백·개행을 한 칸으로 정규화하고 앞뒤를 자른다', () => {
    expect(htmlToPlainText('  <p>  안녕\n\n  하세요  </p>  ')).toBe('안녕 하세요')
  })

  it('제로폭 공백(U+200B)을 제거한다', () => {
    // 운영 데이터에 실제로 남아 있던 형태 — trim()으로는 지워지지 않는다
    expect(htmlToPlainText('<p>오늘​ ​설치했어요</p>')).toBe('오늘 설치했어요')
    expect(htmlToPlainText('​﻿본문')).toBe('본문')
  })

  it('HTML 엔티티를 디코드한다', () => {
    expect(htmlToPlainText('<p>커피&nbsp;한잔</p>')).toBe('커피 한잔')
    expect(htmlToPlainText('A&amp;B')).toBe('A&B')
    expect(htmlToPlainText('&lt;태그&gt;')).toBe('<태그>')
    expect(htmlToPlainText('&quot;인용&quot;')).toBe('"인용"')
    expect(htmlToPlainText('&#39;홑따옴표&#39;')).toBe("'홑따옴표'")
  })

  it('&amp;를 이중 디코드하지 않는다', () => {
    // &amp;lt; 는 화면에 "&lt;"로 보여야 하는 문자열
    expect(htmlToPlainText('&amp;lt;')).toBe('&lt;')
  })

  it('알 수 없는 엔티티는 공백으로 떨어뜨린다', () => {
    expect(htmlToPlainText('앞&hellip;뒤')).toBe('앞 뒤')
  })
})

describe('htmlToPlainText — 스크립트 안전성', () => {
  it('script 블록의 코드가 텍스트로 남지 않는다', () => {
    expect(htmlToPlainText('<p>본문</p><script>alert("xss")</script>')).toBe('본문')
    expect(htmlToPlainText('<script>var a=1;</script>내용')).toBe('내용')
  })

  it('style 블록의 CSS가 텍스트로 남지 않는다', () => {
    expect(htmlToPlainText('<style>.a{color:red}</style>본문')).toBe('본문')
  })

  it('닫히지 않은 script도 잘라낸다', () => {
    expect(htmlToPlainText('<p>앞</p><script>alert(1)')).toBe('앞')
  })

  it('onerror 등 이벤트 핸들러 속성은 태그와 함께 사라진다', () => {
    expect(htmlToPlainText('<img src=x onerror="alert(1)">설명')).toBe('설명')
    expect(htmlToPlainText('<div onclick="steal()">눌러</div>')).toBe('눌러')
  })
})

describe('buildSummary — 100자 규칙 (사용자 작성 경로와 동일)', () => {
  it('100자 이하는 그대로 둔다', () => {
    const text = '가'.repeat(100)
    expect(buildSummary(`<p>${text}</p>`)).toBe(text)
  })

  it('100자를 넘으면 97자 + ...', () => {
    const text = '나'.repeat(150)
    const out = buildSummary(`<p>${text}</p>`)
    expect(out).toBe('나'.repeat(97) + '...')
    expect(out).toHaveLength(100)
  })

  it('경계값 101자에서 잘린다', () => {
    const out = buildSummary(`<p>${'다'.repeat(101)}</p>`)
    expect(out).toBe('다'.repeat(97) + '...')
  })
})

describe('buildSummary — 텍스트 없는 글', () => {
  it('이미지뿐이면 null (미리보기 미렌더 → 빈 줄 방지)', () => {
    expect(buildSummary('<p><img src="https://x/y.jpg" alt="사진" /></p>')).toBeNull()
    expect(buildSummary('<div><img src="a.png"><img src="b.png"></div>')).toBeNull()
  })

  it('영상뿐이면 null', () => {
    expect(buildSummary('<iframe src="https://youtube.com/embed/x"></iframe>')).toBeNull()
  })

  it('빈 문단·공백·제로폭만 있으면 null', () => {
    expect(buildSummary('')).toBeNull()
    expect(buildSummary('<p></p>')).toBeNull()
    expect(buildSummary('<p>&nbsp;</p><p>​</p>')).toBeNull()
    expect(buildSummary('<p><br></p>')).toBeNull()
  })

  it('이미지와 텍스트가 함께면 텍스트를 뽑는다', () => {
    expect(buildSummary('<p><img src="a.jpg"></p><p>사진 설명입니다</p>')).toBe('사진 설명입니다')
  })
})

describe('buildSummary — 운영 데이터 형태', () => {
  it('크롤 원문의 앞 공백·빈 문단을 걷어내고 첫 문장부터 보여준다', () => {
    const html = '<p>&nbsp;</p><p><br></p><p>고양이 합사해 보신 분 계신가요?</p>'
    expect(buildSummary(html)).toBe('고양이 합사해 보신 분 계신가요?')
  })

  it('문장 사이 제로폭 공백이 있어도 읽히는 텍스트가 된다', () => {
    const html = '<p>오늘 설치했어요​</p><p>​기사님가시고 오후에 바로 냉방으로</p>'
    expect(buildSummary(html)).toBe('오늘 설치했어요 기사님가시고 오후에 바로 냉방으로')
  })
})

describe('buildSummary — 출처 꼬리표 제거 (미리보기 전용)', () => {
  it('원본 사이트명이 미리보기에 남지 않는다', () => {
    // PR #141에서 종결한 P0가 미리보기로 재발하지 않게 한다
    expect(buildSummary('<p>잊지말자. 제발좀. 출처: 오늘의유머</p>')).toBe('잊지말자. 제발좀.')
    expect(buildSummary('<p>미쳤다 출처: 네이트판</p>')).toBe('미쳤다')
    expect(buildSummary('<p>가격이 올랐네요 출처: 펨코</p>')).toBe('가격이 올랐네요')
    expect(buildSummary('<p>신상 사먹었어요 출처: 네이버 카페</p>')).toBe('신상 사먹었어요')
  })

  it('일반화된 "온라인 커뮤니티" 꼬리표도 남지 않는다', () => {
    expect(buildSummary('<p>버거킹도 변하네요 출처: 온라인 커뮤니티</p>')).toBe('버거킹도 변하네요')
  })

  it('콜론 없는 출처 표기도 제거한다', () => {
    expect(buildSummary('<p>재밌네요 출처 https://x.com/abc/123</p>')).toBe('재밌네요')
  })

  it('문장 끝 URL 꼬리표를 제거한다', () => {
    expect(buildSummary('<p>기사 보세요 https://n.news.naver.com/article/001</p>')).toBe('기사 보세요')
    expect(buildSummary('<p>여기예요 www.example.com</p>')).toBe('여기예요')
  })

  it('출처 문구만 있으면 null (미리보기 미렌더)', () => {
    expect(buildSummary('<p>출처: 펨코</p>')).toBeNull()
    expect(buildSummary('<p>출처: 오늘의유머</p>')).toBeNull()
    expect(buildSummary('<p>출처: 온라인 커뮤니티</p>')).toBeNull()
    expect(buildSummary('<p>출처 https://x.com/a</p>')).toBeNull()
  })

  it('출처+URL은 문장 앞·중간에 있어도 제거한다', () => {
    // 실데이터에서 꼬리표보다 머리표가 많았다 — 앞에 와서 본문을 밀어낸다
    expect(buildSummary('<p>출처 https://instiz.net/pt/78523 강아지랑 산책했어요</p>')).toBe('강아지랑 산책했어요')
    expect(buildSummary('<p>웃기다 출처 https://x.com/abc 그래서 어떻게 됐냐면</p>')).toBe('웃기다 그래서 어떻게 됐냐면')
  })

  it('꼬리표가 겹쳐 있어도 모두 제거한다', () => {
    expect(buildSummary('<p>웃기다 출처: 펨코 https://fmkorea.com/123</p>')).toBe('웃기다')
  })

  it('본문 한가운데의 "출처" 언급은 보존한다', () => {
    // 뒤 40자 제한 — 문장 끝 꼬리표만 노린다
    const long = '이 자료의 출처를 찾다가 결국 원본을 못 찾았는데요 혹시 아시는 분 계신가요 정말 궁금해서 여쭤봅니다 도와주세요'
    expect(buildSummary(`<p>${long}</p>`)).toContain('출처를 찾다가')
  })

  it('출처 표기가 없는 정상 본문은 그대로 둔다', () => {
    expect(buildSummary('<p>고양이 합사해 보신 분 계신가요?</p>')).toBe('고양이 합사해 보신 분 계신가요?')
  })

  it('꼬리표를 걷어낸 뒤에 100자를 센다', () => {
    // 먼저 자르면 꼬리표가 자리를 차지해 본문이 밀려난다
    const body = '가'.repeat(100)
    expect(buildSummary(`<p>${body} 출처: 펨코</p>`)).toBe(body)
  })
})

/**
 * 아래는 2026-07-30 백필 dry-run(대상 2,168건 전수)에서 실제로 잔존이 확인된 형태다.
 * 기존 규칙이 "문자열 꼬리"만 봐서, 출처가 앞·중간에 있는 과거 글에서 새어 나왔다.
 * 사이트명 1 · 출처문구 4 · URL 19 · 'ㅊㅊ' 44건 → 이 케이스들을 계약으로 고정한다.
 */
describe('buildSummary — 출처 초성 은어 (ㅊㅊ)', () => {
  it('꼬리에 남은 "ㅊㅊ:"를 제거한다', () => {
    expect(buildSummary('<p>사자 갈기 숱이 적어진다고 ㅊㅊ:</p>')).toBe('사자 갈기 숱이 적어진다고')
  })

  it('콜론 없이 꼬리에 붙은 "ㅊㅊ"도 제거한다', () => {
    expect(buildSummary('<p>이거 진짜 맛있어요 ㅊㅊ</p>')).toBe('이거 진짜 맛있어요')
  })

  it('"ㅊㅊ: URL" 형태를 통째로 제거한다', () => {
    expect(buildSummary('<p>좋은 글 ㅊㅊ: https://example.com/abc</p>')).toBe('좋은 글')
  })

  it('콜론 없는 "ㅊㅊ URL"도 제거한다', () => {
    expect(buildSummary('<p>먹고싶다 ㅊㅊ https://cafe.daum.net/ssaumjil/LnOm/3328201</p>')).toBe('먹고싶다')
  })

  it('출처 은어만 있으면 null (미리보기 미렌더)', () => {
    expect(buildSummary('<p>ㅊㅊ: https://example.com/abc</p>')).toBeNull()
  })

  it('추천 뜻으로 쓰인 "ㅊㅊ해요"는 보존한다', () => {
    // 뒤에 글자가 이어지면 출처 표기가 아니다 — 무리하게 지우지 않는다
    expect(buildSummary('<p>이 영화 ㅊㅊ해요 정말 재밌었어요</p>')).toBe('이 영화 ㅊㅊ해요 정말 재밌었어요')
  })
})

describe('buildSummary — 위치 무관 URL / 링크카드 도메인', () => {
  it('문장 끝이 아닌 URL도 제거한다', () => {
    expect(buildSummary('<p>쇼츠에 떠서해봤는데 https://youtube.com/shorts/abc</p>')).toBe('쇼츠에 떠서해봤는데')
  })

  it('머리에 온 URL이 본문을 밀어내지 않는다', () => {
    expect(buildSummary('<p>https://youtube.com/shorts/w9LE9 쇼츠에 떠서해봤는데 바로되네요.</p>')).toBe(
      '쇼츠에 떠서해봤는데 바로되네요.'
    )
  })

  it('문장 중간에 끼어든 URL을 제거한다', () => {
    expect(buildSummary('<p>다니던 정형외과에서 https://www.threads.com/@a/post/DZ 도수치료실 없앤대요</p>')).toBe(
      '다니던 정형외과에서 도수치료실 없앤대요'
    )
  })

  it('스킴 없는 링크카드 도메인을 제거한다', () => {
    expect(buildSummary('<p>충청 화법하니까 그거 생각난다 instiz.net</p>')).toBe('충청 화법하니까 그거 생각난다')
    expect(buildSummary('<p>스마트폰 생기기전 2007년 모습 blog.naver.com</p>')).toBe('스마트폰 생기기전 2007년 모습')
    expect(buildSummary('<p>막상 해보면 그저 그렇다는 의견도 있다 x.com</p>')).toBe('막상 해보면 그저 그렇다는 의견도 있다')
  })

  it('URL만 있으면 null', () => {
    expect(buildSummary('<p>https://youtube.com/shorts/abc</p>')).toBeNull()
    expect(buildSummary('<p>instiz.net</p>')).toBeNull()
  })

  it('목록에 없는 일반 도메인 언급은 보존한다', () => {
    // 모든 도메인을 지우려 하지 않는다 — dry-run에서 확인된 링크카드만 처리
    expect(buildSummary('<p>회사 메일이 example.co.kr 로 바뀌었어요</p>')).toBe('회사 메일이 example.co.kr 로 바뀌었어요')
  })
})

describe('buildSummary — 괄호형 무특정 출처', () => {
  it('(자료출처:인터넷) 을 제거한다', () => {
    expect(buildSummary('<p>(자료출처:인터넷) 국민연금 월 167만원이 중요한 이유</p>')).toBe(
      '국민연금 월 167만원이 중요한 이유'
    )
  })

  it('(그림출처:인터넷) / (사진출처:인터넷) 도 제거한다', () => {
    expect(buildSummary('<p>(그림출처:인터넷) 대한민국 50대 은퇴 후 90%가 겪는 문제</p>')).toBe(
      '대한민국 50대 은퇴 후 90%가 겪는 문제'
    )
    expect(buildSummary('<p>(사진출처:인터넷) 오늘의 풍경</p>')).toBe('오늘의 풍경')
  })

  it('긴 괄호 주석은 보존한다', () => {
    // 괄호 안 20자 제한 — 출처 표기가 아닌 설명은 남긴다
    const text = '올해부터 (기초연금과 국민연금을 함께 받는 경우 감액될 수 있습니다) 확인이 필요해요'
    expect(buildSummary(`<p>${text}</p>`)).toBe(text)
  })
})

describe('buildSummary — 본문 중간 출처 표기', () => {
  it('꼬리가 아닌 "출처 : 매체 | 매체"를 제거하고 뒤 본문은 남긴다', () => {
    // dry-run 실측 문자열. 출처 뒤로 본문이 40자 넘게 이어져 기존 꼬리 규칙이 닿지 않았다.
    const real =
      '포모 가고 조모 온다…"안 산 사람이 승자" 확산 출처 : SBS | 네이버 포모대신 조모 새로운 신조어랍니다 ~ 포모 가고 조모 온다네요 어떻게라도 주식시장에 열기가 돌면 좋겠어요'
    const r = buildSummary(`<p>${real}</p>`)
    expect(r).not.toContain('출처')
    expect(r).not.toContain('SBS')
    expect(r).toContain('포모대신 조모')
  })

  it('출처 뒤가 짧으면 꼬리로 보고 통째로 지운다 (기존 계약)', () => {
    // 뒤 40자 이내는 꼬리표로 간주한다 — 중간 출처 규칙보다 꼬리 규칙이 먼저다
    expect(buildSummary('<p>기사 잘 봤어요 출처 : SBS | 네이버 참고하세요</p>')).toBe('기사 잘 봤어요')
  })

  it('조사가 붙은 일반 문장의 "출처"는 보존한다', () => {
    // 콜론을 필수로 둬서 "출처를 찾다가" 같은 문장을 지우지 않는다
    const long = '이 자료의 출처를 찾다가 결국 원본을 못 찾았는데요 혹시 아시는 분 계신가요 정말 궁금해서 여쭤봅니다'
    expect(buildSummary(`<p>${long}</p>`)).toContain('출처를 찾다가')
  })

  it('제거 후 남는 텍스트가 없으면 null', () => {
    expect(buildSummary('<p>출처 : SBS | 네이버</p>')).toBeNull()
    expect(buildSummary('<p>(자료출처:인터넷)</p>')).toBeNull()
  })
})
