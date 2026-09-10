import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// 실제 server action을 호출한다. $transaction은 "콜백이 던지면 아무것도 커밋되지 않고,
// 읽고 쓰는 사이 남이 먼저 커밋하면 P2034, slug가 겹치면 P2002"인 페이크로 대체해
// 원자성·중복방지·동시성 처리를 검증한다.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/admin-auth', () => ({ getAdminSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    boardConfig: { findUnique: vi.fn() },
    $transaction: vi.fn(),
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
const mockTransaction = vi.mocked(prisma.$transaction)
const mockBanned = vi.mocked(checkBannedWords)
const mockSlug = vi.mocked(generateCommunitySlug)

const PERSONA_EMAIL = 'bot-a@unao.bot' // 하늘바라기 — STORY / MENOPAUSE
const HUMOR_ONLY_EMAIL = 'bot-ay@unao.bot' // 웃음보따리 — HUMOR 전용
const AUTHOR_ID = 'persona-user-1'

const INPUT = {
  personaEmail: PERSONA_EMAIL,
  boardType: 'STORY',
  title: '오늘 아침에 있었던 일',
  content: '아침부터 비가 와서 한참을 서 있었어요.\n별것 아닌데 기분이 묘하더라고요.',
}

// ── 트랜잭션 페이크 ───────────────────────────────────────────
interface StoredPost {
  id: string
  authorId: string
  boardType: string
  status: string
  title: string
  content: string
  slug: string | null
  createdAt: Date
  source: string
  category: string | null
  summary: string | null
  publishedAt: Date | null
}

interface Db {
  posts: StoredPost[]
  postCountByUser: Record<string, number>
  audits: Record<string, unknown>[]
  isolationLevels: unknown[]
  /** 커밋될 때마다 증가 — Serializable 충돌 판정용 스냅샷 버전 */
  commitVersion: number
}

let db: Db
/** true면 감사 로그 create가 실패한다 — 부분 저장이 남는지 확인용 */
let failAudit = false
/** 남은 횟수만큼 트랜잭션 진입 즉시 P2034를 던진다 (직렬화 충돌 재현) */
let serializationFailuresLeft = 0

function freshDb(): Db {
  return { posts: [], postCountByUser: {}, audits: [], isolationLevels: [], commitVersion: 0 }
}

class PrismaP2034 extends Error {
  code = 'P2034'
}
class PrismaP2002 extends Error {
  code = 'P2002'
  meta = { target: ['slug'] }
}

function plantPost(overrides: Partial<StoredPost>): StoredPost {
  const row: StoredPost = {
    id: `planted-${db.posts.length + 1}`,
    authorId: AUTHOR_ID,
    boardType: 'STORY',
    status: 'PUBLISHED',
    title: INPUT.title,
    content: '',
    slug: null,
    createdAt: new Date(),
    source: 'ADMIN',
    category: null,
    summary: null,
    publishedAt: new Date(),
    ...overrides,
  }
  db.posts.push(row)
  return row
}

function installTransactionFake() {
  mockTransaction.mockImplementation((async (
    fn: (tx: unknown) => Promise<unknown>,
    opts?: { isolationLevel?: string },
  ) => {
    db.isolationLevels.push(opts?.isolationLevel)

    if (serializationFailuresLeft > 0) {
      serializationFailuresLeft -= 1
      throw new PrismaP2034('write conflict')
    }

    // 트랜잭션 시작 시점의 스냅샷. 커밋 직전에 이 값이 바뀌어 있으면
    // "읽고 나서 쓰는 사이에 남이 먼저 커밋했다" = Serializable 충돌(P2034).
    const snapshot = db.commitVersion

    const staged: {
      posts: StoredPost[]
      counts: Record<string, number>
      audits: Record<string, unknown>[]
    } = { posts: [], counts: {}, audits: [] }
    let seq = db.posts.length

    const tx = {
      post: {
        findMany: async (args: {
          where: {
            authorId: string
            boardType: string
            status: string
            createdAt: { gte: Date }
            content: string
          }
        }) => {
          const w = args.where
          return db.posts
            .filter(
              (p) =>
                p.authorId === w.authorId &&
                p.boardType === w.boardType &&
                p.status === w.status &&
                p.content === w.content &&
                p.createdAt >= w.createdAt.gte,
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        },
        create: async (args: { data: Record<string, unknown> }) => {
          const slug = args.data.slug as string | null
          // Post.slug는 unique — 이미 커밋된 글과 겹치면 P2002
          if (slug !== null && db.posts.some((p) => p.slug === slug)) {
            throw new PrismaP2002('unique constraint failed')
          }
          seq += 1
          const row = { id: `post-${seq}`, createdAt: new Date(), ...args.data } as StoredPost
          staged.posts.push(row)
          return { id: row.id }
        },
      },
      user: {
        update: async (args: {
          where: { id: string }
          data: { postCount: { increment: number } }
        }) => {
          staged.counts[args.where.id] =
            (staged.counts[args.where.id] ?? 0) + args.data.postCount.increment
          return {}
        },
      },
      adminAuditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          if (failAudit) throw new Error('audit log write failed')
          staged.audits.push(args.data)
          return {}
        },
      },
    }

    const out = await fn(tx) // 여기서 던지면 아래 커밋에 도달하지 않는다 = 롤백
    // 쓰기가 있는 트랜잭션만 충돌 대상이다 (중복 감지로 아무것도 안 쓴 경우는 통과)
    if (staged.posts.length > 0 && db.commitVersion !== snapshot) {
      throw new PrismaP2034('write conflict')
    }
    db.commitVersion += 1
    db.posts.push(...staged.posts)
    for (const [id, n] of Object.entries(staged.counts)) {
      db.postCountByUser[id] = (db.postCountByUser[id] ?? 0) + n
    }
    db.audits.push(...staged.audits)
    return out
  }) as never)
}

/** generateCommunitySlug 흉내 — 이미 쓰인 slug면 -2, -3 … 을 붙여 준다 */
function installSlugFake(base = '오늘-아침에-있었던-일') {
  mockSlug.mockImplementation(async () => {
    if (!db.posts.some((p) => p.slug === base)) return base
    for (let i = 2; i <= 9; i++) {
      const candidate = `${base}-${i}`
      if (!db.posts.some((p) => p.slug === candidate)) return candidate
    }
    return `${base}-x`
  })
}

function happyPath(email = PERSONA_EMAIL) {
  mockSession.mockResolvedValue({ adminId: 'admin1', email: 'a@b.c', nickname: '창업자' })
  mockUserFind.mockResolvedValue({
    id: AUTHOR_ID,
    nickname: '하늘바라기',
    email,
    status: 'ACTIVE',
  } as never)
  mockBoardConfig.mockResolvedValue({ isActive: true } as never)
  mockBanned.mockResolvedValue(null as never)
  installSlugFake()
  installTransactionFake()
}

beforeEach(() => {
  vi.clearAllMocks()
  db = freshDb()
  failAudit = false
  serializationFailuresLeft = 0
})

describe('publishAsFounderPersona — allowlist·계정 가드', () => {
  it('어드민 세션이 없으면 트랜잭션조차 열지 않는다', async () => {
    mockSession.mockResolvedValue(null)

    const r = await publishAsFounderPersona(INPUT)

    expect(r).toEqual({ error: '관리자 인증이 필요합니다.' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('allowlist 밖 이메일이면 계정 조회조차 하지 않는다', async () => {
    happyPath()

    for (const personaEmail of ['curator-a@unao.bot', 'official@unao.bot', 'someone@kakao.com']) {
      const r = await publishAsFounderPersona({ ...INPUT, personaEmail })
      expect(r).toEqual({ error: '허용 목록에 없는 페르소나입니다' })
    }
    expect(mockUserFind).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('페르소나가 허용하지 않은 게시판은 서버가 거부한다', async () => {
    happyPath(HUMOR_ONLY_EMAIL)

    // 웃음보따리는 HUMOR 전용
    for (const boardType of ['STORY', 'LIFE2', 'MENOPAUSE']) {
      const r = await publishAsFounderPersona({
        ...INPUT,
        personaEmail: HUMOR_ONLY_EMAIL,
        boardType,
      })
      expect('error' in r && r.error).toContain('이 게시판에 쓸 수 없습니다')
    }
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(db.posts).toHaveLength(0)

    // 허용 게시판(HUMOR)은 통과
    const ok = await publishAsFounderPersona({
      ...INPUT,
      personaEmail: HUMOR_ONLY_EMAIL,
      boardType: 'HUMOR',
    })
    expect('duplicate' in ok && ok.duplicate).toBe(false)
    expect(db.posts).toHaveLength(1)
  })

  it('페르소나 계정이 DB에 없으면 발행하지 않고 생성도 하지 않는다', async () => {
    happyPath()
    mockUserFind.mockResolvedValue(null as never)

    const r = await publishAsFounderPersona(INPUT)

    expect('error' in r && r.error).toContain('DB에 없습니다')
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(db.posts).toHaveLength(0)
  })

  it('계정이 ACTIVE가 아니면 거부', async () => {
    happyPath()
    for (const status of ['SUSPENDED', 'BANNED', 'WITHDRAWN']) {
      mockUserFind.mockResolvedValue({
        id: 'u1',
        nickname: '아무개',
        email: PERSONA_EMAIL,
        status,
      } as never)

      const r = await publishAsFounderPersona(INPUT)

      expect('error' in r && r.error).toContain('ACTIVE 상태가 아닙니다')
    }
    expect(db.posts).toHaveLength(0)
  })

  it('@unao.bot이 아닌 계정으로는 발행하지 않는다 (allowlist 오편집 2차 방어선)', async () => {
    happyPath()
    mockUserFind.mockResolvedValue({
      id: 'real-member',
      nickname: '진짜회원',
      email: 'someone@kakao.com',
      status: 'ACTIVE',
    } as never)

    const r = await publishAsFounderPersona(INPUT)

    expect(r).toEqual({ error: '페르소나 계정이 아닌 사용자로는 발행할 수 없습니다.' })
    expect(db.posts).toHaveLength(0)
  })

  it('금지어·비활성 게시판이면 트랜잭션을 열지 않는다', async () => {
    happyPath()
    mockBanned.mockResolvedValueOnce('욕설' as never)
    expect('error' in (await publishAsFounderPersona(INPUT))).toBe(true)

    happyPath()
    mockBoardConfig.mockResolvedValue({ isActive: false } as never)
    expect(await publishAsFounderPersona(INPUT)).toEqual({
      error: '현재 글을 작성할 수 없는 게시판입니다.',
    })

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(db.posts).toHaveLength(0)
  })
})

describe('publishAsFounderPersona — 원자성', () => {
  it('Post·postCount·감사 로그가 한 트랜잭션에서 함께 커밋된다', async () => {
    happyPath()

    const r = await publishAsFounderPersona(INPUT)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(db.posts).toHaveLength(1)
    expect(db.postCountByUser[AUTHOR_ID]).toBe(1)
    expect(db.audits).toHaveLength(1)
    expect('duplicate' in r && r.duplicate).toBe(false)
  })

  it('Serializable 격리 수준으로 연다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)

    expect(db.isolationLevels).toEqual(['Serializable'])
  })

  it('감사 로그가 실패하면 게시글도 postCount도 남지 않는다', async () => {
    happyPath()
    failAudit = true

    await expect(publishAsFounderPersona(INPUT)).rejects.toThrow('audit log write failed')

    expect(db.posts).toHaveLength(0)
    expect(db.postCountByUser[AUTHOR_ID]).toBeUndefined()
    expect(db.audits).toHaveLength(0)
  })

  it('postCount를 1 증가시킨다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)
    await publishAsFounderPersona({ ...INPUT, title: '다른 제목입니다' })

    expect(db.postCountByUser[AUTHOR_ID]).toBe(2)
  })
})

describe('publishAsFounderPersona — 중복 발행 방지 (공개 글만)', () => {
  it('같은 요청을 두 번 보내도 Post는 한 번만 생성된다', async () => {
    happyPath()

    const first = await publishAsFounderPersona(INPUT)
    const second = await publishAsFounderPersona(INPUT)

    expect(db.posts).toHaveLength(1)
    expect(db.audits).toHaveLength(1)
    expect(db.postCountByUser[AUTHOR_ID]).toBe(1)
    expect('duplicate' in first && first.duplicate).toBe(false)
    expect('duplicate' in second && second.duplicate).toBe(true)
    expect('postId' in first && 'postId' in second && first.postId === second.postId).toBe(true)
  })

  it('연속 클릭 3회 → Post 1건', async () => {
    happyPath()

    await Promise.all([
      publishAsFounderPersona(INPUT),
      publishAsFounderPersona(INPUT),
      publishAsFounderPersona(INPUT),
    ])

    expect(db.posts).toHaveLength(1)
  })

  it('제목 공백만 다른 재요청도 중복으로 본다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)
    const again = await publishAsFounderPersona({ ...INPUT, title: `  ${INPUT.title}  ` })

    expect(db.posts).toHaveLength(1)
    expect('duplicate' in again && again.duplicate).toBe(true)
  })

  it('중복 조회 where에 status=PUBLISHED와 content가 들어가고 take는 없다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)

    // 페이크가 where를 그대로 받아 필터에 썼다는 건 위 테스트들이 증명한다.
    // 여기서는 소스에 take가 남아 있지 않은지만 본다.
    const src = readFileSync(
      path.join(process.cwd(), 'src/lib/actions/admin/admin.persona-publish.ts'),
      'utf-8',
    )
    expect(src).not.toMatch(/take:\s*\d+/)
    expect(src).toContain("status: 'PUBLISHED'")
    expect(src).toContain('content: safeContent')
  })

  it('DRAFT·HIDDEN·SEO_ONLY·DELETED 글은 기존 글로 반환하지 않는다', async () => {
    for (const status of ['DRAFT', 'HIDDEN', 'SEO_ONLY', 'DELETED']) {
      db = freshDb()
      happyPath()
      // 제목·본문·작성자·게시판이 모두 같지만 공개 상태가 아닌 글을 심어 둔다
      const planted = plantPost({
        status,
        slug: `기존-${status}`,
        content: '<p>아침부터 비가 와서 한참을 서 있었어요.</p><p>별것 아닌데 기분이 묘하더라고요.</p>',
      })

      const r = await publishAsFounderPersona(INPUT)

      expect('duplicate' in r && r.duplicate).toBe(false)
      expect('postId' in r && r.postId).not.toBe(planted.id)
      expect(db.posts.filter((p) => p.status === 'PUBLISHED')).toHaveLength(1)
    }
  })

  it('본문이 다르면 새 글로 발행한다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)
    await publishAsFounderPersona({ ...INPUT, content: '완전히 다른 본문입니다. 열 자 넘습니다.' })

    expect(db.posts).toHaveLength(2)
  })

  it('중복이면 캐시를 흔들지 않는다', async () => {
    const { revalidatePath } = await import('next/cache')
    happyPath()

    await publishAsFounderPersona(INPUT)
    const callsAfterFirst = vi.mocked(revalidatePath).mock.calls.length
    await publishAsFounderPersona(INPUT)

    expect(vi.mocked(revalidatePath).mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('publishAsFounderPersona — 동시성 (P2034 · P2002)', () => {
  it('직렬화 충돌(P2034)이 나면 재시도하고, 재시도에서 중복을 잡는다', async () => {
    happyPath()
    await publishAsFounderPersona(INPUT) // 기존 글 1건 심어 둔다
    serializationFailuresLeft = 1

    const r = await publishAsFounderPersona(INPUT)

    expect('duplicate' in r && r.duplicate).toBe(true)
    expect(db.posts).toHaveLength(1)
  })

  it('재시도를 다 써도 충돌하면 명확한 오류를 돌려준다 (부분 저장 없음)', async () => {
    happyPath()
    serializationFailuresLeft = 3

    const r = await publishAsFounderPersona(INPUT)

    expect('error' in r && r.error).toContain('동시에 같은 요청')
    expect(db.posts).toHaveLength(0)
    expect(db.audits).toHaveLength(0)
  })

  it('slug 충돌(P2002) — 같은 제목·다른 본문은 새 고유 slug로 정상 발행된다', async () => {
    happyPath()

    // 첫 글이 기본 slug를 가져간다
    await publishAsFounderPersona(INPUT)
    expect(db.posts[0].slug).toBe('오늘-아침에-있었던-일')

    // 같은 제목, 다른 본문 → 중복 아님. slug 생성기가 낡은 값을 돌려주게 만들어
    // P2002를 강제로 유발하고, 재시도에서 새 고유 slug로 발행되는지 본다.
    mockSlug.mockResolvedValueOnce('오늘-아침에-있었던-일')
    const r = await publishAsFounderPersona({
      ...INPUT,
      content: '같은 제목이지만 본문이 완전히 다릅니다.',
    })

    expect('duplicate' in r && r.duplicate).toBe(false)
    expect(db.posts).toHaveLength(2)
    expect(db.posts[1].slug).toBe('오늘-아침에-있었던-일-2')
    expect(new Set(db.posts.map((p) => p.slug)).size).toBe(2)
  })

  it('slug 확보와 INSERT 사이에 남이 먼저 커밋해도(P2002) 재시도로 발행된다', async () => {
    happyPath()
    // 이미 그 slug를 쓰는 글이 있는데 slug 생성기가 낡은 값을 돌려준 상황을 만든다
    plantPost({ status: 'PUBLISHED', slug: '오늘-아침에-있었던-일', content: '<p>남의 글</p>' })
    mockSlug.mockResolvedValueOnce('오늘-아침에-있었던-일') // 낡은 값 → P2002 유발

    const r = await publishAsFounderPersona(INPUT)

    expect('duplicate' in r && r.duplicate).toBe(false)
    expect(db.posts.filter((p) => p.id.startsWith('post-'))).toHaveLength(1)
    expect(db.posts.find((p) => p.id.startsWith('post-'))?.slug).toBe('오늘-아침에-있었던-일-2')
  })

  it('MENOPAUSE는 slug가 null이라 P2002 경로를 타지 않는다', async () => {
    happyPath()

    const r = await publishAsFounderPersona({ ...INPUT, boardType: 'MENOPAUSE' })

    expect(mockSlug).not.toHaveBeenCalled()
    expect(db.posts[0].slug).toBeNull()
    expect('postUrl' in r && r.postUrl).toBe('/community/menopause/post-1')
  })
})

describe('publishAsFounderPersona — 저장 내용', () => {
  it('즉시 PUBLISHED · source=ADMIN · category=null · 페르소나 계정이 작성자', async () => {
    happyPath()

    const r = await publishAsFounderPersona(INPUT)

    const post = db.posts[0]
    expect(post.status).toBe('PUBLISHED')
    expect(post.source).toBe('ADMIN')
    expect(post.category).toBeNull()
    expect(post.authorId).toBe(AUTHOR_ID)
    expect(post.boardType).toBe('STORY')
    expect(post.publishedAt).toBeInstanceOf(Date)
    expect('postUrl' in r && r.postUrl).toBe('/community/stories/오늘-아침에-있었던-일')
    expect('authorNickname' in r && r.authorNickname).toBe('하늘바라기')
  })

  it('감사 로그에 원문 작성자(어드민)와 표시 작성자(페르소나)를 나눠 남긴다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)

    const audit = db.audits[0]
    expect(audit.adminId).toBe('admin1')
    expect(audit.action).toBe('FOUNDER_PERSONA_PUBLISH')
    expect(audit.targetType).toBe('POST')
    const after = audit.after as Record<string, unknown>
    expect(after.authoredByAdminId).toBe('admin1')
    expect(after.displayedAsUserId).toBe(AUTHOR_ID)
    expect(after.displayedAsEmail).toBe(PERSONA_EMAIL)
    expect(String(audit.note)).toContain('창업자 직접 작성')
  })

  it('평문 본문은 이스케이프된 <p> HTML로 저장된다 — HTML 주입 불가', async () => {
    happyPath()

    await publishAsFounderPersona({
      ...INPUT,
      content: '<script>alert(1)</script> 이 문장은 열 자가 넘습니다.',
    })

    expect(db.posts[0].content).not.toContain('<script>')
    expect(db.posts[0].content).toContain('&lt;script&gt;')
  })

  it('줄바꿈은 문단으로 나뉜다', async () => {
    happyPath()

    await publishAsFounderPersona(INPUT)

    expect(db.posts[0].content.match(/<p>/g)?.length).toBe(2)
  })
})

describe('publishAsFounderPersona — 소스 계약', () => {
  const ROOT = process.cwd()

  /** 주석은 걷어내고 실제 코드만 본다 — 설명문에 등장하는 금지 패턴에 걸리지 않도록 */
  function codeOnly(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
  }

  const ACTION_SRC = codeOnly('src/lib/actions/admin/admin.persona-publish.ts')
  const PAGE_SRC = codeOnly('src/app/admin/(panel)/content/persona-publish/page.tsx')
  const USAGE_SRC = codeOnly('src/lib/queries/admin/admin.persona-usage.ts')

  it('계정 생성 경로가 없다 (create·upsert·ensureBotUser 금지)', () => {
    expect(ACTION_SRC).not.toMatch(/user\.(create|upsert)/)
    expect(ACTION_SRC).not.toContain('ensureBotUser')
    expect(PAGE_SRC).not.toMatch(/user\.(create|upsert)/)
  })

  it('Raw SQL을 쓰지 않는다', () => {
    for (const src of [ACTION_SRC, PAGE_SRC, USAGE_SRC]) {
      expect(src).not.toMatch(/\$executeRaw|\$queryRaw|\$executeRawUnsafe|\$queryRawUnsafe/)
    }
  })

  it('DRAFT·예약 발행 경로가 없다 (이번 범위 밖)', () => {
    expect(ACTION_SRC).not.toContain("'DRAFT'")
  })

  it('페이지는 ACTIVE 계정만 조회한다', () => {
    expect(PAGE_SRC).toContain("status: 'ACTIVE'")
  })
})
