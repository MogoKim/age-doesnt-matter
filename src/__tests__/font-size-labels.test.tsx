import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  FONT_SIZE_VALUES,
  FONT_SIZE_LABELS,
  FONT_SIZE_BODY_PX,
  isFontSizeValue,
} from '@/lib/font-size-labels'

/**
 * 글자 크기 단계의 이름만 바꾸는 작업이다. **크기는 한 명도 바뀌면 안 된다.**
 *
 * 회귀 이력: 같은 단계를 화면마다 다르게 불렀다 —
 *   GNB "기본/크게/매우 크게" · 마이페이지 "보통/크게/아주크게" · 푸터 "보통/크게/아주 크게"
 *   소개 FAQ는 "작게/보통/크게"라 어느 화면과도 안 맞았다.
 *
 * 그래서 여기서 두 가지를 잠근다.
 *   ① 이름이 한 곳에서만 나오는지
 *   ② 저장값·크기·승격 로직을 건드리지 않았는지 (건드리면 쓰던 사람 글씨가 강제로 바뀐다)
 */

const root = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

let mockFontSize = 'LARGE'
vi.mock('@/components/common/FontSizeProvider', () => ({
  useFontSize: () => ({ fontSize: mockFontSize, setFontSize: () => {} }),
}))

const { default: HeaderFontSizeToggle } = await import('@/components/common/HeaderFontSizeToggle')
const { default: FooterFontSizeToggle } = await import('@/components/common/FooterFontSizeToggle')

beforeEach(() => { mockFontSize = 'LARGE' })
afterEach(cleanup)

describe('라벨 매핑', () => {
  it('NORMAL=작게 · LARGE=기본 · XLARGE=크게', () => {
    expect(FONT_SIZE_LABELS).toEqual({ NORMAL: '작게', LARGE: '기본', XLARGE: '크게' })
  })

  it('본문 크기 안내가 globals.css의 --text-body와 같다', () => {
    expect(FONT_SIZE_BODY_PX).toEqual({ NORMAL: '18px', LARGE: '20px', XLARGE: '24px' })
    const css = read('src/app/globals.css')
    // :root = NORMAL(18px) / LARGE / XLARGE 블록
    expect(css).toMatch(/--text-body:\s*1\.125rem/)   // 18px
    expect(css).toMatch(/--text-body:\s*1\.25rem/)    // 20px
    expect(css).toMatch(/--text-body:\s*1\.5rem/)     // 24px
  })

  it('단계는 3개이고 저장값 이름은 그대로다', () => {
    expect(FONT_SIZE_VALUES).toEqual(['NORMAL', 'LARGE', 'XLARGE'])
  })

  it('이상값을 걸러낸다', () => {
    expect(isFontSizeValue('LARGE')).toBe(true)
    for (const v of ['small', 'SMALL', '작게', '', null, undefined, 1]) {
      expect(isFontSizeValue(v), String(v)).toBe(false)
    }
  })
})

describe('화면이 같은 이름을 쓴다', () => {
  it('GNB 가+ 드롭다운', () => {
    render(<HeaderFontSizeToggle />)
    // 드롭다운은 닫혀 있으므로 열고 확인 (React onClick은 fireEvent로 태워야 한다)
    fireEvent.click(screen.getByLabelText('가+ 글씨 크기 조절'))
    for (const label of ['작게', '기본', '크게']) {
      expect(screen.getByText(label), label).toBeTruthy()
    }
    expect(screen.queryByText('보통')).toBeNull()
    expect(screen.queryByText('매우 크게')).toBeNull()
    expect(screen.queryByText('아주크게')).toBeNull()
  })

  it('푸터 토글 — 화면 낭독기가 읽는 이름', () => {
    render(<FooterFontSizeToggle />)
    for (const label of ['글씨 작게', '글씨 기본', '글씨 크게']) {
      expect(screen.getByLabelText(label), label).toBeTruthy()
    }
    expect(screen.queryByLabelText('글씨 보통')).toBeNull()
    expect(screen.queryByLabelText('글씨 아주 크게')).toBeNull()
  })

  it('네 화면 모두 font-size-labels에서 이름을 가져온다', () => {
    for (const f of [
      'src/components/common/HeaderFontSizeToggle.tsx',
      'src/components/common/FooterFontSizeToggle.tsx',
      'src/components/features/my/FontSizeSettings.tsx',
    ]) {
      expect(read(f), f).toMatch(/from '@\/lib\/font-size-labels'/)
    }
    // 소개 FAQ는 문장이라 상수를 못 쓴다 — 문구만 맞춘다
    expect(read('src/app/(main)/about/page.tsx')).toMatch(/작게\/기본\/크게/)
  })
})

describe('크기·저장은 손대지 않았다 — 이게 깨지면 쓰던 사람 글씨가 바뀐다', () => {
  it('저장 키와 승격 플래그가 그대로다', () => {
    const provider = read('src/components/common/FontSizeProvider.tsx')
    expect(provider).toMatch(/const LS_KEY = 'unao-font-size'/)
    expect(provider).toMatch(/const DEFAULT_SIZE: FontSizeValue = 'LARGE'/)
    expect(provider).toMatch(/VALID_SIZES = \['NORMAL', 'LARGE', 'XLARGE'\]/)

    const layout = read('src/app/layout.tsx')
    expect(layout).toMatch(/unao-font-size/)
    expect(layout).toMatch(/unao-font-default-v2/)
    // NORMAL → LARGE 1회 승격이 그대로 있어야 한다
    expect(layout).toMatch(/s==='NORMAL'/)
  })

  it('DB 검증도 그대로다', () => {
    const settings = read('src/lib/actions/settings.ts')
    expect(settings).toMatch(/\['NORMAL', 'LARGE', 'XLARGE'\]/)
  })

  it('globals.css의 단계 선택자가 그대로다', () => {
    const css = read('src/app/globals.css')
    expect(css).toMatch(/html\[data-font-size="LARGE"\]/)
    expect(css).toMatch(/html\[data-font-size="XLARGE"\]/)
    // NORMAL은 매칭 규칙 없이 :root가 적용되는 구조 — 선택자가 생기면 설계가 바뀐 것
    expect(css).not.toMatch(/html\[data-font-size="NORMAL"\]/)
  })
})
