import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// 실제 server action을 호출해 "미리보기까지 DB write 없음 / 계정 가드 / 즉시 PUBLISHED"를 검증한다.

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}))
vi.mock('@/lib/admin-auth', () => ({ getAdminSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    boardConfig: { findUnique: vi.fn() },
    post: { create: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  },
}))
vi.mock('@/lib/banned-words', () => ({ checkBannedWords: vi.fn() }))
vi.mock('@/lib/seo/slug', () => ({ generateCommunitySlug: vi.fn() }))

import { publishAsFounderPersona } from '@/lib/actions/admin/admin.persona-publish'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { checkBannedWords } from '@/lib/banned-words'
import { generateCommunitySlug } from '@/lib/seo/slug'

const mockSession = vi.mocked(getAdminSession)
const mockUserFind = vi.mocked(prisma.user.findUnique)
const mockBoardConfig = vi.mocked(prisma.boardConfig.findUnique)
const mockPostCreate = vi.mocked(prisma.post.create)
const mockAudit = vi.mocked(prisma.adminAuditLog.create)
const mockBanned = vi.mocked(checkBannedWords)
const mockSlug = vi.mocked(generateCommunitySlug)

/** post.create / adminAuditLog.create에 넘어간 data를 타입 마찰 없이 읽는다 */
function createdData(
  mock: { mock: { calls: unknown[][] } },
  callIndex = 0,
): Record<string, unknown> {
  const args = mock.mock.calls[callIndex][0] as { data: unknown }
  return args.data as Record<string, unknown>
}

const INPUT = {
  personaId: 'official',
  boardType: 'STORY',
  title: '오늘 아침에 있었던 일',
  content: '아침부터 비가 와서 한참을 서 있었어요.\n별것 아닌데 기분이 묘하더라고요.',
}

function happyPath() {
  mockSession.mockResolvedValue({ adminId: 'admin1', email: 'a@b.c', nickname: '창업자' })
  mockUserFind.mockResolvedValue({
    id: 'persona-user-1',
    nickname: '우리 나이가 어때서',
    email: 'official@unao.bot',
    status: 'ACTIVE',
  } as never)
  mockBoardConfig.mockResolvedValue({ isActive: true } as never)
  mockBanned.mockResolvedValue(null as never)
  mockSlug.mockResolvedValue('오늘-아침에-있었던-일')
  mockPostCreate.mockResolvedValue({ id: 'post-1' } as never)
  mockAudit.mockResolvedValue({} as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('publishAsFounderPersona — 발행 가드', () => {
  it('어드민 세션이 없으면 DB write 없이 거부', async () => {
    mockSession.mockResolvedValue(null)

    const r = await publishAsFounderPersona(INPUT)

    expect(r).toEqual({ error: '관리자 인증이 필요합니다.' })
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('입력이 유효하지 않으면 계정 조회조차 하지 않는다', async () => {
    mockSession.mockResolvedValue({ adminId: 'admin1', email: 'a@b.c', nickname: '창업자' })

    const r = await publishAsFounderPersona({ ...INPUT, content: '짧음' })

    expect('error' in r).toBe(true)
    expect(mockUserFind).not.toHaveBeenCalled()
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('페르소나 계정이 DB에 없으면 발행하지 않고 자동 생성도 하지 않는다', async () => {
    happyPath()
    mockUserFind.mockResolvedValue(null as never)

    const r = await publishAsFounderPersona(INPUT)

    expect('error' in r && r.error).toContain('DB에 없습니다')
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('계정이 ACTIVE가 아니면 거부', async () => {
    happyPath()
    mockUserFind.mockResolvedValue({
      id: 'u1',
      nickname: '아무개',
      email: 'official@unao.bot',
      status: 'SUSPENDED',
    } as never)

    const r = await publishAsFounderPersona(INPUT)

    expect('error' in r && r.error).toContain('ACTIVE 상태가 아닙니다')
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('@unao.bot이 아닌 계정으로는 발행하지 않는다 (카탈로그 오편집 2차 방어선)', async () => {
    happyPath()
    mockUserFind.mockResolvedValue({
      id: 'real-member',
      nickname: '진짜회원',
      email: 'someone@kakao.com',
      status: 'ACTIVE',
    } as never)

    const r = await publishAsFounderPersona(INPUT)

    expect(r).toEqual({ error: '페르소나 계정이 아닌 사용자로는 발행할 수 없습니다.' })
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('금지어가 있으면 발행하지 않는다', async () => {
    happyPath()
    mockBanned.mockResolvedValueOnce('욕설' as never)

    const r = await publishAsFounderPersona(INPUT)

    expect('error' in r).toBe(true)
    expect(mockPostCreate).not.toHaveBeenCalled()
  })

  it('비활성 게시판이면 발행하지 않는다', async () => {
    happyPath()
    mockBoardConfig.mockResolvedValue({ isActive: false } as never)

    const r = await publishAsFounderPersona(INPUT)

    expect(r).toEqual({ error: '현재 글을 작성할 수 없는 게시판입니다.' })
    expect(mockPostCreate).not.toHaveBeenCalled()
  })
})

describe('publishAsFounderPersona — 소스 계약', () => {
  const ACTION_SRC = readFileSync(
    path.join(process.cwd(), 'src/lib/actions/admin/admin.persona-publish.ts'),
    'utf-8',
  )

  it('계정 자동 생성 경로가 소스에 없다 (create·upsert·ensureBotUser 금지)', () => {
    expect(ACTION_SRC).not.toMatch(/user\.(create|upsert)/)
    expect(ACTION_SRC).not.toContain('ensureBotUser')
  })

  it('DRAFT·예약 발행 경로가 소스에 없다 (이번 범위 밖)', () => {
    expect(ACTION_SRC).not.toContain("'DRAFT'")
  })
})

describe('publishAsFounderPersona — 발행 결과', () => {
  it('즉시 PUBLISHED · source=ADMIN · category=null · 페르소나 계정 작성자로 저장', async () => {
    happyPath()

    const r = await publishAsFounderPersona(INPUT)

    expect(mockPostCreate).toHaveBeenCalledTimes(1)
    const data = createdData(mockPostCreate)
    expect(data.status).toBe('PUBLISHED')
    expect(data.source).toBe('ADMIN')
    expect(data.category).toBeNull()
    expect(data.authorId).toBe('persona-user-1')
    expect(data.boardType).toBe('STORY')
    expect(data.publishedAt).toBeInstanceOf(Date)
    expect('postUrl' in r && r.postUrl).toBe('/community/stories/오늘-아침에-있었던-일')
    expect('authorNickname' in r && r.authorNickname).toBe('우리 나이가 어때서')
  })

  it('평문 본문은 이스케이프된 <p> HTML로 저장된다 — HTML 주입 불가', async () => {
    happyPath()

    await publishAsFounderPersona({
      ...INPUT,
      content: '<script>alert(1)</script> 이 문장은 열 자가 넘습니다.',
    })

    const data = createdData(mockPostCreate)
    const content = String(data.content)
    expect(content).not.toContain('<script>')
    expect(content).toContain('&lt;script&gt;')
  })

  it('줄바꿈은 문단으로 나뉜다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)

    const data = createdData(mockPostCreate)
    expect(String(data.content).match(/<p>/g)?.length).toBe(2)
  })

  it('MENOPAUSE는 slug 없이 id 기반 URL (회원 createPost와 동일)', async () => {
    happyPath()
    mockUserFind.mockResolvedValue({
      id: 'persona-body',
      nickname: '몸과마음',
      email: 'founder-body@unao.bot',
      status: 'ACTIVE',
    } as never)

    const r = await publishAsFounderPersona({
      ...INPUT,
      personaId: 'body',
      boardType: 'MENOPAUSE',
    })

    expect(mockSlug).not.toHaveBeenCalled()
    const data = createdData(mockPostCreate)
    expect(data.slug).toBeNull()
    expect('postUrl' in r && r.postUrl).toBe('/community/menopause/post-1')
  })

  it('감사 로그를 남긴다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)

    expect(mockAudit).toHaveBeenCalledTimes(1)
    const data = createdData(mockAudit)
    expect(data.adminId).toBe('admin1')
    expect(data.action).toBe('FOUNDER_PERSONA_PUBLISH')
    expect(data.targetType).toBe('POST')
    expect(data.targetId).toBe('post-1')
  })
})
