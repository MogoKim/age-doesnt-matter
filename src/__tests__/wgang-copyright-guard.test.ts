import { describe, it, expect } from 'vitest'
import { shouldSkipWgangMediaPost } from '../../agents/cafe/copyright-guard'

describe('shouldSkipWgangMediaPost — wgang 미디어 글 전체 차단(저작권)', () => {
  it('wgang + imageUrls 1개 → skip', () => {
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang', imageUrls: ['https://img/1.jpg'], videoUrls: [] })).toBe(true)
  })

  it('wgang + videoUrls 1개 → skip', () => {
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang', imageUrls: [], videoUrls: ['https://vid/1.mp4'] })).toBe(true)
  })

  it('wgang + image·video 둘 다 → skip', () => {
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang', imageUrls: ['a'], videoUrls: ['b'] })).toBe(true)
  })

  it('wgang + media 없음 → 허용(false)', () => {
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang', imageUrls: [], videoUrls: [] })).toBe(false)
  })

  it('wgang + 긴 텍스트여도 image 1개면 skip (텍스트 길이 무관)', () => {
    // helper는 media 유무만 본다 — 길이는 호출부에서 이미 무관
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang', imageUrls: ['x'], videoUrls: [] })).toBe(true)
  })

  it('non-wgang + image 있음 → 이 가드는 무영향(false, 기존 카페 정책 유지)', () => {
    expect(shouldSkipWgangMediaPost({ cafeId: 'remonterrace', imageUrls: ['x'], videoUrls: [] })).toBe(false)
    expect(shouldSkipWgangMediaPost({ cafeId: 'dlxogns01', imageUrls: ['x', 'y'], videoUrls: ['z'] })).toBe(false)
    expect(shouldSkipWgangMediaPost({ cafeId: 'goondae', imageUrls: [], videoUrls: ['v'] })).toBe(false)
  })

  it('null/undefined media 필드 안전 처리 → media 없음으로 간주', () => {
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang', imageUrls: null, videoUrls: undefined })).toBe(false)
    expect(shouldSkipWgangMediaPost({ cafeId: 'wgang' })).toBe(false)
  })
})
