/**
 * 어드민 **저장 경로 동작 계약** — Admin Console Foundation 2.1.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 *  이 배치는 AdBannerTable·BannerManager·ContentTable 의 컨트롤을 공용 primitive
 *  (`AdminInput`·`AdminSelect`·`AdminButton`·`AdminInlineButton`)로 갈아끼웠다.
 *  겉모습은 그대로여도 **`onClick`·`onSubmit`·`disabled` 배선이 끊기면 저장이 조용히 사라진다.**
 *  MemberTable 만 덮은 `admin-screen-behavior.test.tsx` 로는 이 세 화면이 비어 있었다.
 *
 *  🔴 E2E Admin 은 이 PR 에서 돌지 않는다(둘 다 이번 배치에서 바꾸지 않는다):
 *    ① `admin` paths-filter 가 `src/app/(admin)/**` 뿐이라 `src/components/admin/**` 변경을 못 본다
 *       → **후속 workflow 항목**으로 분리해 기록한다(이 PR 에서 ci.yml 을 건드리지 않는다).
 *    ② `vars.E2E_ADMIN_ENABLED` 게이트 — 격리 staging + 전용 계정에서만 켜는 production write 방지 계약.
 *  그래서 server action 을 mock 해 **"같은 인자로 부르는가"** 를 여기서 고정한다.
 *
 *  🔴 이 테스트는 DB 를 건드리지 않는다. 모든 server action 은 mock 이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
let searchParams = new URLSearchParams('')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => searchParams,
}))

// server action mock — 호출 인자를 그대로 기록한다.
const adminCreateAdBanner = vi.fn(async (..._a: unknown[]) => ({}))
const adminUpdateAdBanner = vi.fn(async (..._a: unknown[]) => ({}))
const adminDeleteAdBanner = vi.fn(async (..._a: unknown[]) => ({}))
const adminCreateBanner = vi.fn(async (..._a: unknown[]) => ({}))
const adminUpdateBanner = vi.fn(async (..._a: unknown[]) => ({}))
const adminDeleteBanner = vi.fn(async (..._a: unknown[]) => ({}))
const adminTogglePin = vi.fn(async (..._a: unknown[]) => ({}))
const adminBulkAction = vi.fn(async (..._a: unknown[]) => ({}))
const adminMovePost = vi.fn(async (..._a: unknown[]) => ({}))

vi.mock('@/lib/actions/admin', () => ({
  adminCreateAdBanner: (...a: unknown[]) => adminCreateAdBanner(...a),
  adminUpdateAdBanner: (...a: unknown[]) => adminUpdateAdBanner(...a),
  adminDeleteAdBanner: (...a: unknown[]) => adminDeleteAdBanner(...a),
  adminCreateBanner: (...a: unknown[]) => adminCreateBanner(...a),
  adminUpdateBanner: (...a: unknown[]) => adminUpdateBanner(...a),
  adminDeleteBanner: (...a: unknown[]) => adminDeleteBanner(...a),
  adminTogglePin: (...a: unknown[]) => adminTogglePin(...a),
  adminBulkAction: (...a: unknown[]) => adminBulkAction(...a),
  adminMovePost: (...a: unknown[]) => adminMovePost(...a),
  adminUpdatePostStatus: vi.fn(),
  adminToggleFeatured: vi.fn(),
  adminSetPostPromotionLevel: vi.fn(),
  adminSetPostLikeCount: vi.fn(),
}))

import AdBannerTable from '@/components/admin/AdBannerTable'
import BannerManager from '@/components/admin/BannerManager'
import ContentTable from '@/components/admin/ContentTable'

/**
 * 어드민 폼은 `<label>` 에 `htmlFor` 가 없다(이번 배치는 리디자인이 아니라 구조를 바꾸지 않았다).
 * 그래서 라벨 텍스트로 찾은 뒤 **같은 래퍼 안의 컨트롤**을 집는다.
 */
function fieldNear(labelText: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const label = screen
    .getAllByText((_, el) => el?.tagName === 'LABEL' && (el.textContent ?? '').trim().startsWith(labelText))
    .at(-1)
  if (!label) throw new Error(`label을 찾지 못했다: ${labelText}`)
  const field = label.parentElement?.querySelector('input, textarea, select')
  if (!field) throw new Error(`${labelText} 라벨 옆 컨트롤을 찾지 못했다`)
  return field as HTMLInputElement
}

let confirmResult = true
beforeEach(() => {
  vi.clearAllMocks()
  searchParams = new URLSearchParams('')
  confirmResult = true
  vi.stubGlobal('confirm', () => confirmResult)
  vi.stubGlobal('alert', () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ─────────────────────────────────────────────────────────────
// AdBannerTable — 광고 슬롯
// ─────────────────────────────────────────────────────────────
const AD = {
  id: 'ad1',
  slot: 'LIST_HEADER',
  adType: 'SELF',
  title: '기존 광고',
  imageUrl: 'https://cdn.example.com/a.webp',
  htmlCode: null,
  clickUrl: '/community',
  targetPath: '/community',
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2026-09-30T00:00:00Z'),
  priority: 3,
  impressions: 10,
  clicks: 2,
  isActive: true,
  createdAt: new Date('2026-08-01T00:00:00Z'),
}

function renderAds() {
  return render(<AdBannerTable ads={[AD]} hasMore={false} activeTab="ads" />)
}

describe('AdBannerTable — 저장 경로', () => {
  it('신규 등록은 폼 값 그대로 adminCreateAdBanner 를 부른다', async () => {
    const { container } = renderAds()
    fireEvent.click(screen.getByRole('button', { name: '+ 광고 추가' }))

    fireEvent.change(fieldNear('제목'), { target: { value: '새 광고' } })
    fireEvent.change(fieldNear('클릭 URL'), { target: { value: '/jobs' } })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(adminCreateAdBanner).toHaveBeenCalledTimes(1))
    const payload = adminCreateAdBanner.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toMatchObject({
      slot: 'LIST_HEADER',
      adType: 'SELF',
      title: '새 광고',
      clickUrl: '/jobs',
      priority: 0,
      endDate: '',
    })
    // 빈 문자열은 undefined 로 넘긴다 — 서버가 "값 없음" 과 "빈 값" 을 구분한다.
    expect(payload.imageUrl).toBeUndefined()
    expect(payload.htmlCode).toBeUndefined()
    // datetime-local(KST 벽시계) → +09:00 을 명시해 보낸다(서버 UTC 오해석 방지).
    expect(payload.startDate).toMatch(/:00\+09:00$/)
  })

  it('수정은 기존 행 값을 그대로 담아 adminUpdateAdBanner(id, payload) 를 부른다', async () => {
    const { container } = renderAds()
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(adminUpdateAdBanner).toHaveBeenCalledTimes(1))
    expect(adminUpdateAdBanner).toHaveBeenCalledWith('ad1', {
      slot: 'LIST_HEADER',
      adType: 'SELF',
      title: '기존 광고',
      imageUrl: 'https://cdn.example.com/a.webp',
      htmlCode: undefined,
      clickUrl: '/community',
      targetPath: '/community',
      startDate: '2026-09-01T09:00:00+09:00',
      endDate: '2026-09-30T09:00:00+09:00',
      priority: 3,
    })
  })

  it('삭제 확인을 취소하면 server action 을 부르지 않는다', () => {
    confirmResult = false
    renderAds()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(adminDeleteAdBanner).not.toHaveBeenCalled()
  })

  it('삭제를 승인하면 해당 id 로 adminDeleteAdBanner 를 부른다', async () => {
    renderAds()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(adminDeleteAdBanner).toHaveBeenCalledWith('ad1'))
  })

  it('활성 전환은 isActive 를 뒤집은 값만 보낸다', async () => {
    renderAds()
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }))
    await waitFor(() => expect(adminUpdateAdBanner).toHaveBeenCalledWith('ad1', { isActive: false }))
  })
})

// ─────────────────────────────────────────────────────────────
// BannerManager — 히어로 배너
// ─────────────────────────────────────────────────────────────
const BANNER = {
  id: 'b1',
  title: '기존 배너',
  subtitle: '부제',
  themeColor: '#FF6F61',
  themeColorMid: null,
  themeColorEnd: null,
  ctaText: '보러가기',
  ctaUrl: '/magazine',
  imageUrl: 'https://cdn.example.com/hero.webp',
  displayOrder: 2,
  slot: 'HERO',
  isActive: true,
  showOverlay: false,
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: null,
}

function renderBanners() {
  return render(<BannerManager banners={[BANNER]} activeTab="hero" />)
}

describe('BannerManager — 저장 경로', () => {
  it('신규 등록은 빈 문자열을 null 로 정규화해 adminCreateBanner 를 부른다', async () => {
    renderBanners()
    fireEvent.click(screen.getByRole('button', { name: '+ 배너 추가' }))
    fireEvent.change(fieldNear('제목'), { target: { value: '  새 배너  ' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => expect(adminCreateBanner).toHaveBeenCalledTimes(1))
    const payload = adminCreateBanner.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toEqual({
      title: '새 배너', // trim 된다
      subtitle: null,
      themeColor: '#FF6F61',
      themeColorMid: null,
      themeColorEnd: null,
      ctaText: null,
      ctaUrl: null,
      displayOrder: 0,
      slot: 'HERO',
      startsAt: null,
      endsAt: null,
      isActive: true,
      showOverlay: true,
    })
    // 이미지가 없으면 imageUrl 키 자체를 넣지 않는다 — 기존 이미지를 지우지 않기 위해서다.
    expect('imageUrl' in payload).toBe(false)
  })

  it('수정은 기존 행 값을 그대로 담아 adminUpdateBanner(id, payload) 를 부른다', async () => {
    renderBanners()
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    // 폼이 열리면 제출 버튼 이름도 '수정' 이 된다 — type=submit 쪽을 누른다.
    const submit = screen
      .getAllByRole('button', { name: '수정' })
      .find((b) => (b as HTMLButtonElement).type === 'submit')!
    fireEvent.click(submit)

    await waitFor(() => expect(adminUpdateBanner).toHaveBeenCalledTimes(1))
    expect(adminUpdateBanner).toHaveBeenCalledWith('b1', {
      title: '기존 배너',
      subtitle: '부제',
      themeColor: '#FF6F61',
      themeColorMid: null,
      themeColorEnd: null,
      ctaText: '보러가기',
      ctaUrl: '/magazine',
      imageUrl: 'https://cdn.example.com/hero.webp',
      displayOrder: 2,
      slot: 'HERO',
      startsAt: '2026-09-01',
      endsAt: null,
      isActive: true,
      showOverlay: false,
    })
  })

  it('삭제 확인을 취소하면 부르지 않고, 승인하면 해당 id 로 부른다', async () => {
    confirmResult = false
    renderBanners()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(adminDeleteBanner).not.toHaveBeenCalled()

    confirmResult = true
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(adminDeleteBanner).toHaveBeenCalledWith('b1'))
  })

  it('저장 중에는 제출 버튼이 잠겨 중복 등록이 되지 않는다', async () => {
    // 응답이 오지 않는 동안 isPending 이 유지된다 — 그 사이 두 번 누른다.
    let release: (() => void) | undefined
    adminCreateBanner.mockImplementationOnce(
      () => new Promise<Record<string, never>>((resolve) => { release = () => resolve({}) }),
    )
    renderBanners()
    fireEvent.click(screen.getByRole('button', { name: '+ 배너 추가' }))
    fireEvent.change(fieldNear('제목'), { target: { value: '중복 방지' } })

    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    const saving = await screen.findByRole('button', { name: '저장 중...' })
    expect((saving as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(saving)
    expect(adminCreateBanner).toHaveBeenCalledTimes(1)
    release?.()
  })
})

// ─────────────────────────────────────────────────────────────
// ContentTable — 콘텐츠 관리
// ─────────────────────────────────────────────────────────────
const POST = {
  id: 'p1',
  boardType: 'STORY',
  category: '일상',
  title: '테스트 글',
  status: 'PUBLISHED',
  source: 'USER',
  promotionLevel: 'NORMAL',
  isPinned: false,
  isFeatured: false,
  viewCount: 10,
  likeCount: 2,
  commentCount: 1,
  reportCount: 0,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  author: { id: 'u1', nickname: '작성자' },
}
const BOARD_CONFIGS = [
  { boardType: 'STORY', categories: ['일상', '고민'] },
  { boardType: 'LIFE2', categories: ['일자리'] },
]

function renderContent(filters: Record<string, string> = {}) {
  return render(
    <ContentTable posts={[POST]} hasMore={false} filters={filters} boardConfigs={BOARD_CONFIGS} />,
  )
}

describe('ContentTable — 필터·검색 라우팅', () => {
  it('상태 필터 변경은 기존 쿼리를 유지한 채 cursor 만 버린다', () => {
    searchParams = new URLSearchParams('board=STORY&cursor=abc')
    renderContent({ board: 'STORY' })

    const statusSelect = screen.getByDisplayValue('전체 상태')
    fireEvent.change(statusSelect, { target: { value: 'HIDDEN' } })

    expect(push).toHaveBeenCalledWith('/admin/content?board=STORY&status=HIDDEN')
  })

  it('검색 제출은 search 파라미터로 라우팅한다', () => {
    searchParams = new URLSearchParams('board=STORY')
    const { container } = renderContent({ board: 'STORY' })

    fireEvent.change(screen.getByLabelText('제목/본문/작성자 검색'), { target: { value: '갱년기' } })
    fireEvent.submit(container.querySelectorAll('form')[0])

    expect(push).toHaveBeenCalledWith(`/admin/content?board=STORY&search=${encodeURIComponent('갱년기')}`)
  })

  it('소스 필터는 source 를 버리고 botType 으로만 라우팅한다', () => {
    searchParams = new URLSearchParams('source=BOT')
    renderContent()

    fireEvent.change(screen.getByDisplayValue('전체 소스'), { target: { value: 'seed' } })

    expect(push).toHaveBeenCalledWith('/admin/content?botType=seed')
  })
})

describe('ContentTable — mutation 인자', () => {
  it('핀 고정은 현재 값을 뒤집어 adminTogglePin(id, next) 을 부른다', async () => {
    renderContent()
    fireEvent.click(screen.getByRole('button', { name: '📌핀' }))
    await waitFor(() => expect(adminTogglePin).toHaveBeenCalledWith('p1', true))
  })

  it('일괄 액션은 선택한 id 배열과 상태를 그대로 넘긴다', async () => {
    renderContent()
    // 행 체크박스 선택 → 일괄 바가 뜬다
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[checkboxes.length - 1])
    fireEvent.click(screen.getByRole('button', { name: '일괄 숨김' }))

    await waitFor(() => expect(adminBulkAction).toHaveBeenCalledWith(['p1'], 'HIDDEN'))
  })

  it('일괄 액션 확인을 취소하면 부르지 않는다', () => {
    confirmResult = false
    renderContent()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[checkboxes.length - 1])
    fireEvent.click(screen.getByRole('button', { name: '일괄 숨김' }))
    expect(adminBulkAction).not.toHaveBeenCalled()
  })
})

describe('ContentTable — 게시판/카테고리 변경', () => {
  function openCategoryEditor() {
    renderContent()
    fireEvent.click(screen.getByTitle('클릭하여 게시판/카테고리 변경'))
  }

  it('저장은 선택한 게시판·카테고리로 adminMovePost 를 부른다', async () => {
    openCategoryEditor()
    fireEvent.click(screen.getByTitle('저장'))
    await waitFor(() => expect(adminMovePost).toHaveBeenCalledWith('p1', 'STORY', '일상'))
  })

  it('확인을 취소하면 저장하지 않는다', () => {
    confirmResult = false
    openCategoryEditor()
    fireEvent.click(screen.getByTitle('저장'))
    expect(adminMovePost).not.toHaveBeenCalled()
  })

  it('취소는 편집 상태를 원래 값으로 되돌리고 server action 을 부르지 않는다', () => {
    openCategoryEditor()
    const boardSelect = screen.getAllByRole('combobox').at(-1)!
    fireEvent.change(boardSelect, { target: { value: 'LIFE2' } })

    fireEvent.click(screen.getByTitle('취소'))

    expect(adminMovePost).not.toHaveBeenCalled()
    // 편집기가 닫히고 원래 게시판 배지로 돌아온다
    const badge = screen.getByTitle('클릭하여 게시판/카테고리 변경')
    expect(within(badge).getByText('사는이야기')).toBeTruthy()
  })
})
