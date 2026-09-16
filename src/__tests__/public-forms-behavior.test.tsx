/**
 * 공개면 폼 동작 계약 — Foundation 3.0 (D).
 *
 * ── 🔴 왜 컨트롤을 공용 primitive 로 바꾸지 않았나 ────────────
 *  "기존 크기·스킨·동작을 보존 가능한 컨트롤만 전환한다"가 조건이었다.
 *  두 폼을 실측해 보니 **보존 가능한 컨트롤이 없다.**
 *
 *   ContactForm 입력  rounded-xl · h-control(고정) · border-border ·
 *                     focus:border-primary + 코랄 글로우 shadow · disabled:opacity-50
 *   공용 Input        rounded-lg · min-h-control+py-2 · border-input ·
 *                     shadow-sm · focus-visible:ring-focus/ring-ring · opacity-disabled
 *
 *   SearchForm 입력   rounded-xl · flex-1 min-w-0 · focus:border-primary (링 없음)
 *   ContactForm 버튼  rounded-xl · font-bold · h-control 고정 (공용 default 는 shadow + min-h)
 *
 *  전환하면 **모서리 반경·그림자·포커스 표현·높이 동작이 모두 바뀐다.**
 *  className 으로 전부 덮으면 원래 클래스를 그대로 다시 쓰는 셈이라 중복이 줄지 않고,
 *  공용 base 의 `focus-visible` 링이 **더해져** 키보드 포커스 모습이 달라진다.
 *  그래서 전환 0건으로 두고, 대신 **회귀 안전망**을 여기 남긴다.
 *  Foundation 2.0 의 "공개면 일괄 전환 불가" 판정과 같은 결론이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const gtmSearch = vi.fn()
const trackEvent = vi.fn()
vi.mock('@/lib/gtm', () => ({ gtmSearch: (...a: unknown[]) => gtmSearch(...a) }))
vi.mock('@/lib/track', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }))

// 🔴 실제 문의 전송은 하지 않는다 — server action 을 mock 한다.
const submitContact = vi.fn(async (..._a: unknown[]) => ({}) as { error?: string })
vi.mock('@/lib/actions/contact', () => ({ submitContact: (...a: unknown[]) => submitContact(...a) }))
const toast = vi.fn()
vi.mock('@/components/common/Toast', () => ({ useToast: () => ({ toast }) }))

import SearchForm from '@/components/features/search/SearchForm'
import ContactForm from '@/components/features/contact/ContactForm'

const STORAGE_KEY = 'una-recent-searches'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  submitContact.mockResolvedValue({})
})
afterEach(cleanup)

/* ─────────────────────────── 검색 ─────────────────────────── */
describe('검색 — 제출', () => {
  it('두 글자 이상이면 검색 페이지로 보낸다', () => {
    render(<SearchForm />)
    fireEvent.change(screen.getByLabelText('검색어 입력'), { target: { value: '갱년기' } })
    fireEvent.click(screen.getByLabelText('검색'))
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent('갱년기')}`)
  })

  it('🔴 한 글자면 아무 일도 일어나지 않는다', () => {
    render(<SearchForm />)
    fireEvent.change(screen.getByLabelText('검색어 입력'), { target: { value: '갱' } })
    fireEvent.click(screen.getByLabelText('검색'))
    expect(push).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('앞뒤 공백은 잘라서 판정하고 저장한다', () => {
    render(<SearchForm />)
    fireEvent.change(screen.getByLabelText('검색어 입력'), { target: { value: '  연금  ' } })
    fireEvent.click(screen.getByLabelText('검색'))
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent('연금')}`)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['연금'])
  })

  it('계측은 검색어 그대로 한 번씩 보낸다', () => {
    render(<SearchForm />)
    fireEvent.change(screen.getByLabelText('검색어 입력'), { target: { value: '일자리' } })
    fireEvent.click(screen.getByLabelText('검색'))
    expect(gtmSearch).toHaveBeenCalledWith('일자리')
    expect(trackEvent).toHaveBeenCalledWith('search', { search_term: '일자리' })
  })
})

describe('최근 검색어', () => {
  it('저장된 목록을 보여주고, 누르면 그 말로 검색한다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['연금', '밑반찬']))
    render(<SearchForm />)
    expect(screen.getByText('최근 검색어')).toBeTruthy()
    // '밑반찬' 은 인기 키워드에도 있다 — 최근 검색어 섹션 안에서만 고른다.
    const item = screen.getByLabelText('밑반찬 삭제').closest('li')!
    fireEvent.click(item.querySelector('button')!)
    expect(push).toHaveBeenCalledWith(`/search?q=${encodeURIComponent('밑반찬')}`)
  })

  it('최신이 앞으로 오고 중복은 하나만 남는다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['연금', '밑반찬']))
    render(<SearchForm />)
    fireEvent.change(screen.getByLabelText('검색어 입력'), { target: { value: '밑반찬' } })
    fireEvent.click(screen.getByLabelText('검색'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['밑반찬', '연금'])
  })

  it('10개를 넘지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from({ length: 10 }, (_, i) => `키워드${i}`)))
    render(<SearchForm />)
    fireEvent.change(screen.getByLabelText('검색어 입력'), { target: { value: '새검색' } })
    fireEvent.click(screen.getByLabelText('검색'))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved).toHaveLength(10)
    expect(saved[0]).toBe('새검색')
  })

  it('개별 삭제와 전체 삭제가 저장소까지 반영된다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['연금', '밑반찬']))
    render(<SearchForm />)
    fireEvent.click(screen.getByLabelText('연금 삭제'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['밑반찬'])
    fireEvent.click(screen.getByText('전체 삭제'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('저장된 값이 깨져 있어도 화면이 죽지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, '{깨진 JSON')
    expect(() => render(<SearchForm />)).not.toThrow()
  })
})

describe('검색 — 접근성', () => {
  it('입력과 버튼에 이름이 붙어 있다', () => {
    render(<SearchForm />)
    expect(screen.getByLabelText('검색어 입력')).toBeTruthy()
    expect(screen.getByLabelText('검색')).toBeTruthy()
    expect(screen.getByLabelText('뒤로가기')).toBeTruthy()
  })

  it('검색 입력은 type=search 다', () => {
    render(<SearchForm />)
    expect(screen.getByLabelText('검색어 입력').getAttribute('type')).toBe('search')
  })
})

/* ─────────────────────────── 문의 ─────────────────────────── */
const TRIGGER = '문의하기'
const SUBMIT = '문의 보내기'
const MSG = '서비스 이용 중 불편한 점을 적습니다'   // 10자 이상 — 버튼 활성 조건

function openContact() {
  const r = render(<ContactForm type="service" />)
  fireEvent.click(screen.getByText(TRIGGER))
  return r
}
const messageBox = () => screen.getByPlaceholderText('서비스 이용 중 불편한 점이나 궁금한 점을 자유롭게 적어주세요')
const submitBtn = () => screen.getByText(SUBMIT)

describe('문의 — payload', () => {
  it('내용만 채워도 보낼 수 있고, 빈 이름·이메일은 undefined 로 간다', async () => {
    openContact()
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(submitContact).toHaveBeenCalledTimes(1))
    expect(submitContact.mock.calls[0][0]).toEqual({
      type: 'service', name: undefined, email: undefined, message: MSG, _honey: '',
    })
  })

  it('이름·이메일은 trim 해서 보낸다', async () => {
    openContact()
    fireEvent.change(screen.getByPlaceholderText('홍길동'), { target: { value: '  홍길동  ' } })
    fireEvent.change(screen.getByPlaceholderText('example@email.com'), { target: { value: '  a@b.com ' } })
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(submitContact).toHaveBeenCalled())
    const payload = submitContact.mock.calls[0][0] as { name?: string; email?: string }
    expect(payload.name).toBe('홍길동')
    expect(payload.email).toBe('a@b.com')
  })

  it('type 이 그대로 실려 간다 (service / biz)', async () => {
    render(<ContactForm type="biz" />)
    fireEvent.click(screen.getByText(TRIGGER))
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(submitContact).toHaveBeenCalled())
    expect((submitContact.mock.calls[0][0] as { type: string }).type).toBe('biz')
  })

  it('🔴 봇 방지 숨김 입력이 남아 있고 항상 빈 값으로 간다', async () => {
    openContact()
    // Radix Sheet 는 portal 로 렌더된다 — container 가 아니라 document 에서 찾는다.
    const honey = document.querySelector('input[name="_honey"]') as HTMLInputElement
    expect(honey, 'honeypot 이 사라졌다').toBeTruthy()
    expect(honey.tabIndex).toBe(-1)
    expect(honey.readOnly).toBe(true)
    expect(honey.style.display).toBe('none')
    expect(honey.getAttribute('aria-hidden')).not.toBeNull()

    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(submitContact).toHaveBeenCalled())
    expect((submitContact.mock.calls[0][0] as { _honey: string })._honey).toBe('')
  })
})

describe('문의 — 최소 길이·중복 제출·오류', () => {
  it('🔴 10자 미만이면 보내기 버튼이 잠긴다', () => {
    openContact()
    expect((submitBtn() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(messageBox(), { target: { value: '짧음' } })
    expect((submitBtn() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(messageBox(), { target: { value: MSG } })
    expect((submitBtn() as HTMLButtonElement).disabled).toBe(false)
  })

  it('공백만 열 칸이면 보낼 수 없다 (trim 기준)', () => {
    openContact()
    fireEvent.change(messageBox(), { target: { value: '          ' } })
    expect((submitBtn() as HTMLButtonElement).disabled).toBe(true)
  })

  it('보내는 중에는 두 번 눌러도 한 번만 간다', async () => {
    let release: (() => void) | undefined
    submitContact.mockImplementationOnce(() => new Promise((r) => { release = () => r({}) }))
    openContact()
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    const saving = await screen.findByText('전송 중...')
    expect((saving as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(saving)
    expect(submitContact).toHaveBeenCalledTimes(1)
    release?.()
  })

  it('서버가 오류를 돌려주면 화면에 남고 토스트는 뜨지 않는다', async () => {
    submitContact.mockResolvedValue({ error: '내용을 10자 이상 적어주세요.' })
    openContact()
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(screen.getByText('내용을 10자 이상 적어주세요.')).toBeTruthy())
    expect(toast).not.toHaveBeenCalled()
  })

  it('성공하면 토스트로 알린다', async () => {
    openContact()
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('접수')))
  })

  it('다시 열면 이전 내용과 오류가 남아 있지 않다', async () => {
    submitContact.mockResolvedValue({ error: '오류 문구' })
    openContact()
    fireEvent.change(messageBox(), { target: { value: MSG } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(screen.getByText('오류 문구')).toBeTruthy())

    fireEvent.click(screen.getByText(TRIGGER))   // 다시 열기 = 초기화
    expect((messageBox() as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('오류 문구')).toBeNull()
  })
})

/* ── 스킨 보존 — 전환하지 않았음을 고정한다 ─────────────────── */
describe('🔴 공개면 스킨은 그대로다', () => {
  it('문의 입력은 rounded-xl·코랄 포커스 글로우를 유지한다', () => {
    openContact()
    const input = document.querySelector('input[placeholder="홍길동"]') as HTMLElement
    expect(input.className).toContain('rounded-xl')
    expect(input.className).toContain('focus:border-primary')
    expect(input.className).toContain('focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)]')
  })

  it('검색 입력은 rounded-xl 과 flex-1 을 유지한다', () => {
    render(<SearchForm />)
    const input = screen.getByLabelText('검색어 입력')
    expect(input.className).toContain('rounded-xl')
    expect(input.className).toContain('flex-1')
  })
})
