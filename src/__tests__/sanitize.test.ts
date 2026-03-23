import { describe, it, expect } from 'vitest'
import { sanitizeHtml, plainTextToSafeHtml, stripHtmlTags } from '@/lib/sanitize'

describe('sanitizeHtml', () => {
  it('허용된 태그는 유지', () => {
    const input = '<p>안녕하세요 <strong>굵은글씨</strong></p>'
    const result = sanitizeHtml(input)
    expect(result).toContain('<p>')
    expect(result).toContain('<strong>')
  })

  it('script 태그 제거 (XSS 방어)', () => {
    const input = '<p>정상 텍스트</p><script>alert("xss")</script>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('정상 텍스트')
  })

  it('on* 이벤트 핸들러 제거', () => {
    const input = '<p onclick="alert(1)">클릭</p>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('onclick')
    expect(result).toContain('클릭')
  })

  it('img 태그는 유지되지만 onerror 제거', () => {
    const input = '<img src="https://example.com/img.jpg" alt="사진" onerror="alert(1)">'
    const result = sanitizeHtml(input)
    expect(result).toContain('<img')
    expect(result).toContain('alt="사진"')
    expect(result).not.toContain('onerror')
  })

  it('유튜브 iframe 허용', () => {
    const input = '<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen></iframe>'
    const result = sanitizeHtml(input)
    expect(result).toContain('iframe')
    expect(result).toContain('youtube.com/embed')
  })

  it('허용되지 않은 도메인의 iframe 제거', () => {
    const input = '<iframe src="https://evil.com/embed"></iframe>'
    const result = sanitizeHtml(input)
    expect(result).not.toContain('evil.com')
  })
})

describe('plainTextToSafeHtml', () => {
  it('줄바꿈을 <p> 태그로 변환', () => {
    const result = plainTextToSafeHtml('첫 번째 줄\n두 번째 줄')
    expect(result).toContain('<p>')
    expect(result).toContain('첫 번째 줄')
    expect(result).toContain('두 번째 줄')
  })

  it('HTML 특수문자 이스케이프', () => {
    const result = plainTextToSafeHtml('<script>alert(1)</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })
})

describe('stripHtmlTags', () => {
  it('HTML 태그 제거하고 텍스트만 반환', () => {
    const result = stripHtmlTags('<p>안녕하세요 <strong>세계</strong></p>')
    expect(result).toBe('안녕하세요 세계')
  })

  it('빈 태그 제거 후 trim', () => {
    const result = stripHtmlTags('<p></p><br>')
    expect(result).toBe('')
  })
})
