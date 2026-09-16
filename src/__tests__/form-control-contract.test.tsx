/**
 * 폼 컨트롤 계약 — `Input` · `Textarea` · `Select`.
 *
 * ── 🔴 왜 필요한가 ──────────────────────────────────────────────
 *  id 를 **label 문자열에서** 만들면 같은 라벨이 두 번 나오는 순간 id 가 충돌한다.
 *  충돌하면 `htmlFor` 가 엉뚱한 입력을 가리켜 **클릭 포커스와 스크린리더 읽기가 뒤바뀐다.**
 *  명시적 id 가 없으면 항상 `React.useId()` 를 쓴다.
 */
import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { Input, Textarea, Select } from '@/components/ui/Input'

afterEach(cleanup)

describe('🔴 같은 label 이 둘이어도 id 가 충돌하지 않는다', () => {
  it('Input 2개 — 서로 다른 id 를 받고 각자의 label 과 연결된다', () => {
    render(
      <>
        <Input label="닉네임" defaultValue="첫번째" />
        <Input label="닉네임" defaultValue="두번째" />
      </>,
    )
    const labels = screen.getAllByText('닉네임') as HTMLLabelElement[]
    expect(labels).toHaveLength(2)

    const [a, b] = labels
    expect(a.htmlFor, 'label 에 htmlFor 가 없다').toBeTruthy()
    expect(b.htmlFor).toBeTruthy()
    expect(a.htmlFor, '같은 label 두 개가 같은 id 를 가리킨다').not.toBe(b.htmlFor)

    // 각 label 이 **자기** 입력과 연결돼 있다
    const inputA = document.getElementById(a.htmlFor) as HTMLInputElement
    const inputB = document.getElementById(b.htmlFor) as HTMLInputElement
    expect(inputA).toBeTruthy()
    expect(inputB).toBeTruthy()
    expect(inputA.value).toBe('첫번째')
    expect(inputB.value).toBe('두번째')
  })

  it('Textarea·Select 도 같은 계약을 지킨다', () => {
    render(
      <>
        <Textarea label="내용" defaultValue="A" />
        <Textarea label="내용" defaultValue="B" />
        <Select label="보드" defaultValue="x">
          <option value="x">X</option>
        </Select>
        <Select label="보드" defaultValue="y">
          <option value="y">Y</option>
        </Select>
      </>,
    )
    for (const text of ['내용', '보드']) {
      const [a, b] = screen.getAllByText(text) as HTMLLabelElement[]
      expect(a.htmlFor).not.toBe(b.htmlFor)
      expect(document.getElementById(a.htmlFor)).toBeTruthy()
      expect(document.getElementById(b.htmlFor)).toBeTruthy()
    }
  })

  it('명시적 id 를 주면 그 id 를 쓴다 — 호출부가 이기는 게 계약이다', () => {
    render(<Input id="nickname-explicit" label="닉네임" />)
    const label = screen.getByText('닉네임') as HTMLLabelElement
    expect(label.htmlFor).toBe('nickname-explicit')
    expect(document.getElementById('nickname-explicit')).toBeTruthy()
  })

  it('🔴 label 문자열에서 id 를 만들지 않는다 — 소스 고정', () => {
    // 되돌아가면 같은 라벨 충돌이 다시 난다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('node:fs').readFileSync('src/components/ui/Input.tsx', 'utf8') as string
    expect(src).not.toMatch(/label[?.]*\.replace\(/)
    expect(src).toContain('React.useId()')
  })
})

describe('error 는 시각 표시로 끝나지 않는다', () => {
  it('aria-invalid 와 aria-describedby 가 error 문구를 가리킨다', () => {
    render(<Input label="닉네임" error="이미 쓰는 이름이에요" />)
    const input = screen.getByLabelText('닉네임')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy, 'aria-describedby 가 없다').toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe('이미 쓰는 이름이에요')
  })

  it('error 가 없으면 aria-invalid 를 붙이지 않는다', () => {
    render(<Input label="닉네임" />)
    expect(screen.getByLabelText('닉네임').getAttribute('aria-invalid')).toBeNull()
  })
})

describe('밀도 — admin 에 터치 규칙을 강제하지 않는다', () => {
  it('기본은 touch(52px), compact 는 36px 클래스를 쓴다', () => {
    const { container } = render(
      <>
        <Input label="A" />
        <Input label="B" density="compact" />
      </>,
    )
    const inputs = container.querySelectorAll('input')
    expect(inputs[0].className).toContain('min-h-control')
    expect(inputs[0].className).not.toContain('min-h-control-compact')
    expect(inputs[1].className).toContain('min-h-control-compact')
  })
})
