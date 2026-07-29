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
