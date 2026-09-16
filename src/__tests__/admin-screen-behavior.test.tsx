/**
 * 어드민 화면 **동작 계약** — Admin Console Foundation 2.1.
 *
 * ── 왜 렌더 테스트인가 ──────────────────────────────────────
 *  이 배치는 컨트롤을 공용 primitive 로 갈아끼웠다. 클래스만 본 테스트로는
 *  **이벤트 배선이 끊겼는지** 알 수 없다 — 검색이 안 먹거나 저장이 안 되는 사고는
 *  화면을 실제로 렌더해 눌러봐야 잡힌다.
 *
 *  🔴 E2E Admin 은 이 PR 에서 돌지 않는다(두 가지 이유, 둘 다 이번 배치에서 바꿀 수 없다):
 *    ① `admin` paths-filter 가 `src/app/(admin)/**` 뿐이라 `src/components/admin/**` 변경을 못 본다
 *    ② `vars.E2E_ADMIN_ENABLED` 게이트 — 어드민 E2E 는 격리 staging + 전용 계정에서만 켜는
 *       안전 계약이다(`e2e-admin-guard.test.ts`). production write 를 막기 위한 것이라 켜지 않는다.
 *  그래서 동작 검증을 여기서 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('page=2'),
}))

// server action mock — 호출 인자를 그대로 기록해 "같은 인자로 부르는가" 를 본다.
const adminUpdateUserStatus = vi.fn(async (..._a: unknown[]) => ({}))
const adminUpdateUserGrade = vi.fn(async (..._a: unknown[]) => ({}))
const adminBulkAction = vi.fn(async (..._a: unknown[]) => ({}))
vi.mock('@/lib/actions/admin', () => ({
  adminUpdateUserStatus: (...a: unknown[]) => adminUpdateUserStatus(...a),
  adminUpdateUserGrade: (...a: unknown[]) => adminUpdateUserGrade(...a),
  adminBulkAction: (...a: unknown[]) => adminBulkAction(...a),
  adminUpdatePostStatus: vi.fn(), adminTogglePin: vi.fn(), adminSetPostPromotionLevel: vi.fn(),
  adminToggleFeatured: vi.fn(), adminSetPostLikeCount: vi.fn(), adminMovePost: vi.fn(),
}))
// Drawer 는 prisma 를 끌어온다 — 이 테스트의 관심사가 아니라 잘라낸다.
vi.mock('@/components/admin/UserContentDrawer', () => ({ default: () => null }))

import MemberTable from '@/components/admin/MemberTable'

const USER = {
  id: 'u1', nickname: '테스트회원', email: 'a@b.com', providerId: '12345',
  grade: 'SPROUT', status: 'ACTIVE', postCount: 3, commentCount: 5, receivedLikes: 7,
  birthYear: 1970, gender: 'F', lastLoginAt: new Date('2026-09-01'), createdAt: new Date('2026-01-01'),
  suspendedUntil: null, role: 'USER',
}

beforeEach(() => { push.mockClear(); adminUpdateUserStatus.mockClear(); adminUpdateUserGrade.mockClear() })
afterEach(cleanup)

function renderMembers(over: Partial<Parameters<typeof MemberTable>[0]> = {}) {
  return render(
    <MemberTable
      users={[USER] as never}
      hasMore
      page={2}
      sort="createdAt"
      order="desc"
      filters={{}}
      {...(over as object)}
    />,
  )
}

describe('MemberTable — 필터·검색·페이지 이동이 살아 있다', () => {
  it('🔴 검색 입력이 반영되고 제출하면 이동한다', () => {
    renderMembers()
    const input = screen.getByLabelText('닉네임/이메일 검색') as HTMLInputElement
    fireEvent.change(input, { target: { value: '홍길동' } })
    expect(input.value, '입력이 상태에 반영되지 않는다').toBe('홍길동')

    fireEvent.submit(input.closest('form')!)
    expect(push, '검색 제출이 라우팅되지 않는다').toHaveBeenCalled()
    expect(String(push.mock.calls[0][0])).toContain('search=')
  })

  it('🔴 상태 필터를 바꾸면 라우팅된다', () => {
    renderMembers()
    const select = screen.getByLabelText('상태 필터') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'SUSPENDED' } })
    expect(push).toHaveBeenCalled()
    expect(String(push.mock.calls[0][0])).toContain('status=SUSPENDED')
  })

  it('🔴 페이지 이동 버튼이 동작한다', () => {
    renderMembers()
    // 1페이지로 갈 때는 `page` 파라미터를 **지운다**(기본값이라 URL 을 더럽히지 않는다).
    fireEvent.click(screen.getByRole('button', { name: /이전/ }))
    expect(String(push.mock.calls[0][0]), '이전 페이지로 안 간다').toBe('/admin/members?')
    push.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /다음/ }))
    expect(String(push.mock.calls[0][0]), '다음 페이지로 안 간다').toContain('page=3')
  })

  it('첫 페이지에서는 이전 버튼이 비활성이다', () => {
    renderMembers({ page: 1 })
    expect(screen.getByRole('button', { name: /이전/ })).toHaveProperty('disabled', true)
  })

  it('마지막 페이지에서는 다음 버튼이 비활성이다', () => {
    renderMembers({ hasMore: false })
    expect(screen.getByRole('button', { name: /다음/ })).toHaveProperty('disabled', true)
  })
})

describe('MemberTable — 저장 동작(server action)이 그대로다', () => {
  it('🔴 등급 변경이 server action 을 같은 인자로 부른다', () => {
    renderMembers()
    const grade = screen.getAllByRole('combobox').find((el) => (el as HTMLSelectElement).value === 'SPROUT')!
    fireEvent.change(grade, { target: { value: 'REGULAR' } })
    expect(adminUpdateUserGrade).toHaveBeenCalledWith('u1', 'REGULAR')
  })

  it('🔴 제재는 확인창을 거쳐야 실행된다 — 취소하면 호출되지 않는다', async () => {
    // 되돌릴 수 없는 동작이라 확인창이 계약이다. 컨트롤을 갈아끼워도 이 순서가 유지돼야 한다.
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    renderMembers()
    fireEvent.click(screen.getByRole('button', { name: /제재/ }))
    fireEvent.click(await screen.findByRole('button', { name: /영구/ }))
    expect(confirmSpy, '확인창 없이 제재가 실행된다').toHaveBeenCalled()
    expect(adminUpdateUserStatus, '취소했는데 실행됐다').not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('🔴 확인창을 승인하면 server action 이 같은 인자로 호출된다', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    renderMembers()
    fireEvent.click(screen.getByRole('button', { name: /제재/ }))
    fireEvent.click(await screen.findByRole('button', { name: /영구/ }))
    expect(adminUpdateUserStatus).toHaveBeenCalled()
    expect(adminUpdateUserStatus.mock.calls[0][0]).toBe('u1')
    expect(adminUpdateUserStatus.mock.calls[0][1]).toBe('BANNED')
    vi.unstubAllGlobals()
  })

  it('제재 토글이 aria-expanded 로 상태를 알린다', () => {
    renderMembers()
    const btn = screen.getByRole('button', { name: /제재/ })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('공용 컨트롤로 바꿔도 접근 이름이 유지된다', () => {
  it('검색 입력·상태 필터에 접근 이름이 있다', () => {
    renderMembers()
    expect(screen.getByLabelText('닉네임/이메일 검색')).toBeTruthy()
    expect(screen.getByLabelText('상태 필터')).toBeTruthy()
  })

  it('페이지 이동 버튼이 이름으로 찾아진다', () => {
    renderMembers()
    expect(screen.getByRole('button', { name: /이전/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /다음/ })).toBeTruthy()
  })
})
