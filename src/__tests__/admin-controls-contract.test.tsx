/**
 * 어드민 컨트롤 계약 — Admin Console Foundation 2.1.
 *
 * ── 이 배치가 지키는 것 ──────────────────────────────────────
 *  · 공용 primitive 를 쓴다(스킨만 어드민 것).
 *  · **크기·색을 바꾸지 않는다.** 이 배치는 리디자인이 아니다.
 *  · admin 에 52px 터치 규칙을 강제하지 않는다.
 *  · label·htmlFor·aria-invalid·aria-describedby·버튼 접근 이름을 유지한다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminButton, AdminInput, AdminSelect, AdminTextarea } from '@/components/admin/ui/AdminControls'
import { CONTROL_HEIGHT } from '@/lib/design-tokens'

afterEach(cleanup)
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')

describe('어드민 컨트롤이 공용 primitive 위에 있다', () => {
  it('AdminControls 가 공용 Button·Input 을 import 한다 — 자체 구현이 아니다', () => {
    const src = read('src/components/admin/ui/AdminControls.tsx')
    expect(src).toContain("from '@/components/ui/Button'")
    expect(src).toContain("from '@/components/ui/Input'")
  })

  it('🔴 compact density 를 쓴다 — 어드민에 터치 규칙을 강제하지 않는다', () => {
    const src = read('src/components/admin/ui/AdminControls.tsx')
    expect(src).toContain('density="compact"')
    expect(src, 'admin 에 touch(52px)를 쓰면 안 된다').not.toContain('density="touch"')
    expect(CONTROL_HEIGHT.compact).toBe(36)
  })
})

describe('🔴 크기·색을 바꾸지 않는다 (리디자인 아님)', () => {
  it('입력 필드 높이가 h-10(40px) 그대로다', () => {
    const { container } = render(<AdminInput label="닉네임" />)
    const input = container.querySelector('input')!
    expect(input.className, 'h-10 이 빠지면 40 → 36px 로 줄어든다').toContain('h-10')
  })

  it('입력 필드가 zinc 테두리와 흰 배경을 유지한다', () => {
    const { container } = render(<AdminInput label="닉네임" />)
    const cls = container.querySelector('input')!.className
    expect(cls).toContain('border-zinc-300')
    expect(cls).toContain('bg-white')
    expect(cls, '공용 그림자가 어드민에 들어가면 안 된다').toContain('shadow-none')
  })

  it('버튼이 zinc-900 강조색을 유지한다 — 브랜드 코랄로 바뀌면 안 된다', () => {
    render(<AdminButton>저장</AdminButton>)
    const cls = screen.getByRole('button', { name: '저장' }).className
    expect(cls).toContain('bg-zinc-900')
    expect(cls, '코랄(bg-primary)로 바뀌었다').not.toMatch(/\bbg-primary\b/)
  })

  it('보조 버튼이 테두리형을 유지한다', () => {
    render(<AdminButton tone="secondary">취소</AdminButton>)
    const cls = screen.getByRole('button', { name: '취소' }).className
    expect(cls).toContain('border-zinc-300')
    expect(cls).toContain('text-zinc-600')
  })

  it('textarea 는 h-10 을 받지 않는다 — 한 줄로 눌린다', () => {
    const { container } = render(<AdminTextarea label="메모" />)
    expect(container.querySelector('textarea')!.className).not.toContain('h-10')
  })
})

describe('접근성 계약', () => {
  it('label 이 htmlFor 로 연결된다', () => {
    render(<AdminInput label="배너 제목" />)
    expect(screen.getByLabelText('배너 제목')).toBeTruthy()
  })

  it('같은 label 이 둘이어도 id 가 충돌하지 않는다', () => {
    render(
      <>
        <AdminInput label="제목" defaultValue="A" />
        <AdminInput label="제목" defaultValue="B" />
      </>,
    )
    const [a, b] = screen.getAllByText('제목') as HTMLLabelElement[]
    expect(a.htmlFor).not.toBe(b.htmlFor)
  })

  it('error 가 aria-invalid·aria-describedby 로 묶인다', () => {
    render(<AdminInput label="URL" error="형식이 올바르지 않습니다" />)
    const input = screen.getByLabelText('URL')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const id = input.getAttribute('aria-describedby')!
    expect(document.getElementById(id)?.textContent).toBe('형식이 올바르지 않습니다')
  })

  it('Select 도 같은 계약을 지킨다', () => {
    render(
      <AdminSelect label="상태">
        <option value="a">A</option>
      </AdminSelect>,
    )
    expect(screen.getByLabelText('상태')).toBeTruthy()
  })

  it('disabled·loading 이 공용 상태 토큰을 쓴다', () => {
    render(<AdminButton isLoading>저장</AdminButton>)
    const btn = screen.getByRole('button', { name: /저장/ })
    expect(btn).toHaveProperty('disabled', true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.className).toContain('disabled:opacity-disabled')
  })
})

describe('🔴 어드민 화면이 공용 컨트롤을 실제로 쓴다', () => {
  /** 어드민 zinc 스킨을 쓰는 화면 — 공용 컨트롤로 전환 대상. */
  const FILES = [
    'src/components/admin/AdBannerTable.tsx',
    'src/components/admin/BannerManager.tsx',
    'src/components/admin/ContentTable.tsx',
    'src/components/admin/MemberTable.tsx',
  ]

  /**
   * 🔴 `PopupManager` 는 **스킨이 다르다** — 전환하면 색이 바뀐다(이 배치는 리디자인이 아니다).
   *   · 버튼이 `bg-primary`(브랜드 코랄) — 다른 4개 화면은 `bg-zinc-900`
   *   · 필드가 `border`(Tailwind 기본 gray-200) — 다른 화면은 `border-zinc-300`
   *   · 필드 높이가 `py-2`(≈42px) — 다른 화면은 `h-10`(40px)
   *  스킨 통일은 디자인 결정이라 별도 배치에서 창업자 판단으로 한다.
   */
  const SKIN_DIVERGENT = 'src/components/admin/PopupManager.tsx'

  it.each(FILES)('%s 가 AdminControls 를 import 한다', (f) => {
    expect(read(f)).toContain("from '@/components/admin/ui/AdminControls'")
  })

  it('🔴 PopupManager 의 스킨 차이는 실제로 존재한다 — 죽은 예외 금지', () => {
    const src = read(SKIN_DIVERGENT)
    expect(src, 'bg-primary 가 없으면 전환을 막을 이유가 사라진다').toContain('bg-primary')
    expect(src).toContain('py-2 text-sm outline-none focus:border-zinc-500')
  })

  it('반복되던 입력 스킨 문자열이 화면 코드에서 사라졌다', () => {
    // 이 문자열이 20회 복붙돼 있었다. 이제 AdminControls 한 곳에만 있어야 한다.
    const DUP = 'h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm'
    const left = FILES.filter((f) => read(f).includes(DUP))
    expect(left, `아직 중복 스킨이 남았다: ${left.join(', ')}`).toEqual([])
  })
})
