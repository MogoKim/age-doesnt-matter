import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  countTodayRewrites,
  kstStartOfDayUtc,
  getTitleRewriteDailyLimit,
  getTitleRewriteSources,
  isTitleRewriteEnabled,
  parseTitleRewriteResponse,
  runTitleRewrite,
  formatTitleRewriteLog,
  previewForLog,
  DESC_PREVIEW_MAX_CHARS,
  MIN_CONFIDENCE,
  type TitleRewriteDeps,
  type TitleRewriteOutcome,
  type TitleRewriteModelResult,
  type TitleRewriteRunInput,
} from '../../agents/cafe/title-rewrite-runner'
import { validateRewrittenTitle } from '../../agents/cafe/title-rewrite-validate'

/**
 * 제목 리라이팅 limited 운영 — 안전 계약 (2026-08-14, PR-D)
 *
 * 이 기능은 제목 리라이팅 프로젝트에서 **처음으로 고객 화면에 닿는** 코드다.
 * 따라서 테스트의 목적은 "제목이 좋아지는가"가 아니라 **"어긋났을 때 원제목으로 남는가"**다.
 *
 * 지키는 계약
 *   1. 플래그가 꺼져 있으면(기본값) 모델을 부르지도, DB를 건드리지도 않는다
 *   2. wgang 외에는 어떤 source도 적용되지 않는다
 *   3. 무엇이 실패하든 title·originalTitle을 건드리지 않는다 — 발행은 이미 끝났다
 *   4. originalTitle은 한 번 쓰이면 덮어쓰지 않는다 (최초 원본 영구 보존)
 *   5. slug·seoTitle은 어떤 경로에서도 업데이트하지 않는다 (URL·검색 제목 불변)
 *
 * ⚠️ 모델 API는 호출하지 않는다. 전부 mock caller다.
 */

const BODY = [
  '추석음식 LA갈비 구이 간장게장 약식 식혜 파김치 미리 할까 했더니 다 하지말래요.',
  '그럼 뭐에다 먹어 예비 사위랑 딸 올텐데 그냥 삼겹살을 사다 구워먹재요.',
  '자기 힘드니깐 하지마 하지마 진심으로 말하네요. 알았어 딴말 하지마 그랬지요.',
  '문젠 추석당일이 남편 생일이라는 거예요. 다들 이럴 때 어떻게 하시나요.',
].join(' ')

const ORIGINAL = '남편이 하지말래요'
const GOOD_TITLE = '추석에 LA갈비 간장게장 다 하려 했더니 그럼 뭐에다 먹어요??'

const ENV_ON = {
  TITLE_REWRITE_ENABLED: 'true',
  TITLE_REWRITE_SOURCES: 'wgang',
  TITLE_REWRITE_DAILY_LIMIT: '5',
} as unknown as NodeJS.ProcessEnv

const input = (over: Partial<TitleRewriteRunInput> = {}): TitleRewriteRunInput => ({
  postId: 'post_1',
  cafeId: 'wgang',
  publishedTitle: ORIGINAL,
  body: BODY,
  author: '우갱회원',
  isUsable: true,
  commentCount: 14,
  likeCount: 1,
  ...over,
})

const modelOk = (over: Partial<TitleRewriteModelResult> = {}): TitleRewriteModelResult => ({
  decision: 'REWRITE',
  rewrittenTitle: GOOD_TITLE,
  styleType: 'QUOTE',
  riskFlags: ['NONE'],
  confidence: 0.88,
  ...over,
})

/** post 저장소 mock — count/findUnique/update 호출을 기록한다 */
function makeRepo(opts: { count?: number; originalTitle?: string | null; countThrows?: boolean } = {}) {
  const update = vi.fn().mockResolvedValue({})
  const count = opts.countThrows
    ? vi.fn().mockRejectedValue(new Error('DB 연결 끊김'))
    : vi.fn().mockResolvedValue(opts.count ?? 0)
  const findUnique = vi.fn().mockResolvedValue({
    title: ORIGINAL,
    originalTitle: opts.originalTitle ?? null,
  })
  return { post: { count, findUnique, update } }
}

/** count()에 넘어간 where 인자를 꺼낸다 — 날짜 기준 필드를 직접 검증하기 위해. */
function countArg(repo: ReturnType<typeof makeRepo>) {
  return repo.post.count.mock.calls[0][0] as {
    where: { originalTitle: unknown; createdAt: { gte: Date } }
  }
}

function deps(over: Partial<TitleRewriteDeps> = {}, model: TitleRewriteModelResult | null = modelOk()): TitleRewriteDeps & {
  callModel: ReturnType<typeof vi.fn>
} {
  const callModel = vi.fn().mockResolvedValue(model)
  return {
    prisma: makeRepo(),
    callModel,
    env: ENV_ON,
    now: () => new Date('2026-08-15T12:00:00+09:00'),
    ...over,
  } as TitleRewriteDeps & { callModel: ReturnType<typeof vi.fn> }
}

describe('설정 — 기본값은 OFF', () => {
  it('환경변수가 없으면 비활성이다', () => {
    expect(isTitleRewriteEnabled({} as NodeJS.ProcessEnv)).toBe(false)
  })

  it("'true'가 아닌 값은 전부 비활성이다", () => {
    for (const v of ['false', '1', 'yes', 'TRUE ', '']) {
      const on = isTitleRewriteEnabled({ TITLE_REWRITE_ENABLED: v } as unknown as NodeJS.ProcessEnv)
      expect(v.trim().toLowerCase() === 'true' ? on : !on).toBe(true)
    }
  })

  it('source 기본값은 wgang 단독이다', () => {
    expect(getTitleRewriteSources({} as NodeJS.ProcessEnv)).toEqual(['wgang'])
  })

  it('daily limit 기본값은 5이고, 잘못된 값도 5로 떨어진다', () => {
    expect(getTitleRewriteDailyLimit({} as NodeJS.ProcessEnv)).toBe(5)
    expect(getTitleRewriteDailyLimit({ TITLE_REWRITE_DAILY_LIMIT: '0' } as unknown as NodeJS.ProcessEnv)).toBe(5)
    expect(getTitleRewriteDailyLimit({ TITLE_REWRITE_DAILY_LIMIT: 'abc' } as unknown as NodeJS.ProcessEnv)).toBe(5)
    expect(getTitleRewriteDailyLimit({ TITLE_REWRITE_DAILY_LIMIT: '10' } as unknown as NodeJS.ProcessEnv)).toBe(10)
  })
})

describe('★ 플래그 OFF — 기존 발행 동작과 100% 동일해야 한다', () => {
  it('모델을 부르지 않고 DB도 건드리지 않는다', async () => {
    const d = deps({ env: {} as NodeJS.ProcessEnv })
    const r = await runTitleRewrite(input(), d)

    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('FLAG_OFF')
    expect(d.callModel).not.toHaveBeenCalled()
    expect(d.prisma.post.update).not.toHaveBeenCalled()
    expect(d.prisma.post.count).not.toHaveBeenCalled()
  })
})

describe('★ source 제한 — wgang만', () => {
  it('yeowooya는 적용하지 않는다', async () => {
    const d = deps()
    const r = await runTitleRewrite(input({ cafeId: 'yeowooya' }), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('SOURCE_NOT_ALLOWED')
    expect(d.callModel).not.toHaveBeenCalled()
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it.each(['remonterrace', 'dlxogns01', 'masanmam', 'goondae'])('%s도 적용하지 않는다', async (cafeId) => {
    const d = deps()
    const r = await runTitleRewrite(input({ cafeId }), d)
    expect(r.applied).toBe(false)
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('★ env가 wgang만이면 remonterrace는 SOURCE_NOT_ALLOWED로 막힌다', async () => {
    // 운영 범위를 좁히는 것은 vars의 역할이다. gate가 아니라 runner에서 걸러진다.
    const env = { ...ENV_ON, TITLE_REWRITE_SOURCES: 'wgang' } as unknown as NodeJS.ProcessEnv
    const d = deps({ env })
    const r = await runTitleRewrite(input({ cafeId: 'remonterrace' }), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('SOURCE_NOT_ALLOWED')
    expect(d.callModel).not.toHaveBeenCalled()
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('★ env가 5개 source면 remonterrace·dlxogns01이 source 단계에서 막히지 않는다', async () => {
    // 2026-08-16 확대: 이전에는 gate의 ['wgang'] 하드코딩 때문에 vars를 늘려도
    // GATE_REJECTED(NOT_TARGET_SOURCE)로 막혔다. 그 회귀를 고정한다.
    const env = {
      ...ENV_ON,
      TITLE_REWRITE_SOURCES: 'wgang,dlxogns01,remonterrace,goondae,masanmam',
    } as unknown as NodeJS.ProcessEnv
    for (const cafeId of ['remonterrace', 'dlxogns01']) {
      const d = deps({ env })
      const r = await runTitleRewrite(input({ cafeId }), d)
      expect(r.skipReason).not.toBe('SOURCE_NOT_ALLOWED')
      expect(r.skipReason).not.toBe('GATE_REJECTED')
    }
  })

  it('★ env를 잘못 넣어 shadow(yeowooya)를 켜도 gate가 막는다', async () => {
    // 이중 방어의 핵심은 그대로 유지된다 — vars 오설정이 shadow 발행으로 이어지지 않는다.
    const env = {
      ...ENV_ON,
      TITLE_REWRITE_SOURCES: 'wgang,yeowooya',
    } as unknown as NodeJS.ProcessEnv
    const d = deps({ env })
    const r = await runTitleRewrite(input({ cafeId: 'yeowooya' }), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('GATE_REJECTED')
    expect(d.callModel).not.toHaveBeenCalled()
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })
})

describe('★ gate 제외면 모델을 부르지 않는다', () => {
  it('본문이 80자 미만이면 skip', async () => {
    const d = deps()
    const r = await runTitleRewrite(input({ body: '짧은 본문입니다.' }), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('GATE_REJECTED')
    expect(d.callModel).not.toHaveBeenCalled()
  })

  it('병원 계정 author면 skip', async () => {
    const d = deps()
    const r = await runTitleRewrite(input({ author: '강남OO성형외과' }), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('GATE_REJECTED')
    expect(d.callModel).not.toHaveBeenCalled()
  })
})

describe('★ daily limit', () => {
  it('한도에 도달하면 모델을 부르지 않는다', async () => {
    const d = deps({ prisma: makeRepo({ count: 5 }) })
    const r = await runTitleRewrite(input(), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('DAILY_LIMIT_REACHED')
    expect(d.callModel).not.toHaveBeenCalled()
  })

  it('한도 미만이면 진행한다', async () => {
    const d = deps({ prisma: makeRepo({ count: 4 }) })
    const r = await runTitleRewrite(input(), d)
    expect(r.applied).toBe(true)
  })

  it('카운트 실패 시 보수적으로 skip한다 (한도를 모르면 쓰지 않는다)', async () => {
    const d = deps({ prisma: makeRepo({ countThrows: true }) })
    const r = await runTitleRewrite(input(), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('LIMIT_COUNT_FAILED')
    expect(d.callModel).not.toHaveBeenCalled()
  })

  it('오늘(KST) 자정 이후 createdAt만 센다', async () => {
    const repo = makeRepo({ count: 2 })
    const n = await countTodayRewrites(repo, new Date('2026-08-15T15:30:00+09:00'))
    expect(n).toBe(2)
    const arg = countArg(repo)
    expect(arg.where.originalTitle).toEqual({ not: null })
    // 2026-08-15 15:30 KST → 그날 KST 자정 = 2026-08-14T15:00:00Z
    expect(arg.where.createdAt.gte.toISOString()).toBe('2026-08-14T15:00:00.000Z')
  })

  it('★ updatedAt은 daily count에 절대 쓰지 않는다 (2026-08-16 회귀 고정)', async () => {
    // 왜: Post.updatedAt은 리라이팅과 무관한 UPDATE(댓글 wave 연동·지표 갱신)로도 갱신된다.
    //     이 기준을 쓰면 어제 적용분이 오늘 카운트에 계속 잡혀 스스로를 영구 차단한다.
    //     실측(2026-08-16): 오늘 적용 0건인데 카운트 10 → 상한 10에 걸려 하루 종일 skip.
    const repo = makeRepo({ count: 0 })
    await countTodayRewrites(repo, new Date('2026-08-16T19:00:00+09:00'))
    const where = countArg(repo).where as Record<string, unknown>
    expect(where.updatedAt).toBeUndefined()
    expect(where).toHaveProperty('createdAt')
  })

  it('★ updatedAt이 오늘이어도 createdAt이 어제면 세지 않는다', async () => {
    // 쿼리 경계를 실제 레코드에 적용해 검증한다 — DB 없이 where 절 의미를 직접 확인.
    const now = new Date('2026-08-16T19:00:00+09:00')
    const gte = kstStartOfDayUtc(now)
    const yesterdayRow = {
      createdAt: new Date('2026-08-15T14:22:00+09:00'), // 어제 발행 = 어제 리라이팅
      updatedAt: new Date('2026-08-16T18:38:00+09:00'), // 오늘 갱신됨 (오염)
    }
    expect(yesterdayRow.updatedAt >= gte).toBe(true)  // updatedAt 기준이면 잡힌다 (버그)
    expect(yesterdayRow.createdAt >= gte).toBe(false) // createdAt 기준이면 안 잡힌다 ✅
  })

  it('한도 직전(limit-1)이면 모델 호출 단계까지 진행한다', async () => {
    const d = deps({ prisma: makeRepo({ count: 4 }) }) // ENV_ON의 limit=5
    const r = await runTitleRewrite(input(), d)
    expect(d.callModel).toHaveBeenCalledTimes(1)
    expect(r.applied).toBe(true)
  })
})

describe('★ KST 하루 경계 — 서버 TZ와 무관하게 계산된다', () => {
  it('UTC 14:59:59(=KST 23:59:59)는 당일에 속한다', () => {
    const gte = kstStartOfDayUtc(new Date('2026-08-16T14:59:59.000Z'))
    expect(gte.toISOString()).toBe('2026-08-15T15:00:00.000Z') // 8/16 KST 자정
  })

  it('UTC 15:00:00(=KST 익일 00:00)은 다음날로 넘어간다', () => {
    const gte = kstStartOfDayUtc(new Date('2026-08-16T15:00:00.000Z'))
    expect(gte.toISOString()).toBe('2026-08-16T15:00:00.000Z') // 8/17 KST 자정
  })

  it('KST 자정 직후·직전이 서로 다른 하루로 갈린다', () => {
    const before = kstStartOfDayUtc(new Date('2026-08-16T14:59:59.999Z'))
    const after = kstStartOfDayUtc(new Date('2026-08-16T15:00:00.000Z'))
    expect(before.getTime()).toBeLessThan(after.getTime())
    expect(after.getTime() - before.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('★ TZ=UTC 환경(GHA ubuntu-latest)에서도 KST 기준이다', () => {
    // setHours(0,0,0,0)를 썼다면 UTC 자정(=KST 09:00)이 나와 운영 의도와 어긋난다.
    const now = new Date('2026-08-16T02:00:00.000Z') // KST 11:00
    const gte = kstStartOfDayUtc(now)
    expect(gte.toISOString()).toBe('2026-08-15T15:00:00.000Z') // KST 자정 ✅
    expect(gte.toISOString()).not.toBe('2026-08-16T00:00:00.000Z') // UTC 자정이면 안 된다
  })

  it('KST 09:00 이전(=UTC 전날)에도 같은 하루로 묶인다', () => {
    // UTC 자정 기준이었다면 KST 08:20 슬롯과 09:05 슬롯이 다른 날로 갈렸다.
    const slot0820 = kstStartOfDayUtc(new Date('2026-08-16T08:20:00+09:00'))
    const slot0905 = kstStartOfDayUtc(new Date('2026-08-16T09:05:00+09:00'))
    expect(slot0820.toISOString()).toBe(slot0905.toISOString())
  })
})

describe('★ createdAt을 리라이팅 시각 대리값으로 쓰는 전제 — 호출부 계약', () => {
  /**
   * countTodayRewrites가 createdAt을 쓰는 근거는 "리라이팅이 발행 직후에만 일어난다"이다.
   * 다른 곳에서 뒤늦게 리라이팅하는 경로가 생기면 이 전제가 깨지고 카운트가 어긋난다.
   */
  const CURATOR = readFileSync(resolve(__dirname, '../../agents/cafe/content-curator.ts'), 'utf8')

  it('runTitleRewrite 호출부는 content-curator의 tryTitleRewrite 하나뿐이다', () => {
    expect((CURATOR.match(/runTitleRewrite\(/g) ?? []).length).toBe(1)
  })

  it('tryTitleRewrite 호출부도 하나뿐이다', () => {
    expect((CURATOR.match(/await tryTitleRewrite\(/g) ?? []).length).toBe(1)
  })

  it('tryTitleRewrite는 발행이 끝난 뒤에 호출된다 (postId 확보 이후)', () => {
    const call = CURATOR.indexOf('await tryTitleRewrite(')
    const publishReturn = CURATOR.indexOf('return post.id')
    expect(publishReturn).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(publishReturn) // 발행 트랜잭션 종료 후
  })
})

describe('★ 모델 실패 — 어떤 경우에도 원제목이 남는다', () => {
  it('모델이 throw하면 skip', async () => {
    const d = deps()
    d.callModel = vi.fn().mockRejectedValue(new Error('API 오류'))
    const r = await runTitleRewrite(input(), d as TitleRewriteDeps)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('MODEL_ERROR')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('timeout은 MODEL_TIMEOUT으로 구분된다', async () => {
    const d = deps()
    d.callModel = vi.fn().mockRejectedValue(new Error('Request timeout after 20000ms'))
    const r = await runTitleRewrite(input(), d as TitleRewriteDeps)
    expect(r.skipReason).toBe('MODEL_TIMEOUT')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('파싱 실패(null)면 skip', async () => {
    const d = deps({}, null)
    const r = await runTitleRewrite(input(), d)
    expect(r.skipReason).toBe('MODEL_PARSE_FAILED')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('decision=KEEP이면 원제목 유지 — 실패가 아니라 판단력이다', async () => {
    const d = deps({}, modelOk({ decision: 'KEEP', rewrittenTitle: '' }))
    const r = await runTitleRewrite(input(), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('MODEL_KEEP')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('decision=REJECT이면 원제목 유지', async () => {
    const d = deps({}, modelOk({ decision: 'REJECT', rewrittenTitle: '' }))
    expect((await runTitleRewrite(input(), d)).skipReason).toBe('MODEL_REJECT')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('confidence가 낮으면 원제목 유지', async () => {
    const d = deps({}, modelOk({ confidence: MIN_CONFIDENCE - 0.01 }))
    expect((await runTitleRewrite(input(), d)).skipReason).toBe('LOW_CONFIDENCE')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('update가 실패해도 예외를 던지지 않는다', async () => {
    const repo = makeRepo()
    repo.post.update = vi.fn().mockRejectedValue(new Error('DB write 실패'))
    const r = await runTitleRewrite(input(), deps({ prisma: repo }))
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('UPDATE_FAILED')
  })
})

describe('★ 적용 성공 — originalTitle 보존 + slug/seoTitle 불변', () => {
  it('originalTitle이 null이면 현재 title을 저장하고 title을 바꾼다', async () => {
    const repo = makeRepo({ originalTitle: null })
    const r = await runTitleRewrite(input(), deps({ prisma: repo }))

    expect(r.applied).toBe(true)
    expect(r.newTitle).toBe(GOOD_TITLE)

    const arg = repo.post.update.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> }
    expect(arg.where.id).toBe('post_1')
    expect(arg.data.title).toBe(GOOD_TITLE)
    expect(arg.data.originalTitle).toBe(ORIGINAL)
  })

  it('★ originalTitle이 이미 있으면 덮어쓰지 않는다 (최초 원본 영구 보존)', async () => {
    const repo = makeRepo({ originalTitle: '진짜 최초 원제목' })
    await runTitleRewrite(input(), deps({ prisma: repo }))

    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.originalTitle).toBe('진짜 최초 원제목')
    expect(arg.data.originalTitle).not.toBe(ORIGINAL)
  })

  it('★ title과 seoTitle이 모두 새 제목으로 들어간다 (P0-2)', async () => {
    // generateMetadata가 `post.seoTitle ?? post.title`을 쓰므로, seoTitle이 원제목으로
    // 남아 있으면 리라이팅이 검색엔진에 한 글자도 전달되지 않는다.
    const repo = makeRepo()
    await runTitleRewrite(input(), deps({ prisma: repo }))

    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.title).toBe(GOOD_TITLE)
    expect(arg.data.seoTitle).toBe(GOOD_TITLE)
    expect(arg.data.seoTitle).toBe(arg.data.title) // 화면과 검색 제목이 어긋나지 않는다
  })

  it('★ slug·seoDescription·content·publishedAt은 절대 업데이트하지 않는다', async () => {
    // slug를 바꾸면 URL·canonical이 끊겨 기존 색인을 잃는다. seoTitle만 바꾸는 이유다.
    const repo = makeRepo()
    await runTitleRewrite(input(), deps({ prisma: repo }))

    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    for (const forbidden of ['slug', 'seoDescription', 'content', 'summary', 'publishedAt', 'status']) {
      expect(arg.data).not.toHaveProperty(forbidden)
    }
    expect(Object.keys(arg.data).sort()).toEqual(['originalTitle', 'seoTitle', 'title'])
  })

  it('Post를 찾지 못하면 update하지 않는다', async () => {
    const repo = makeRepo()
    repo.post.findUnique = vi.fn().mockResolvedValue(null)
    const r = await runTitleRewrite(input(), deps({ prisma: repo }))
    expect(r.skipReason).toBe('UPDATE_FAILED')
    expect(repo.post.update).not.toHaveBeenCalled()
  })
})

describe('★ seoTitle은 적용 성공 경로에서만 바뀐다 (P0-2)', () => {
  /**
   * seoTitle은 검색엔진이 읽는 제목이다. 실패·보류 경로에서 건드리면
   * 원제목 유지라는 안전 계약이 깨지고, 검색 결과만 어긋난 채 남는다.
   * 아래 모든 경로에서 update 자체가 일어나지 않아야 한다.
   */
  const cases: [string, () => ReturnType<typeof deps>][] = [
    ['MODEL_KEEP', () => deps({}, modelOk({ decision: 'KEEP' }))],
    ['MODEL_REJECT', () => deps({}, modelOk({ decision: 'REJECT', rewrittenTitle: '' }))],
    ['LOW_CONFIDENCE', () => deps({}, modelOk({ confidence: MIN_CONFIDENCE - 0.01 }))],
    ['DAILY_LIMIT_REACHED', () => deps({ prisma: makeRepo({ count: 5 }) })],
    ['LIMIT_COUNT_FAILED', () => deps({ prisma: makeRepo({ countThrows: true }) })],
    [
      'VALIDATION_FAILED',
      () => deps({}, modelOk({ rewrittenTitle: '부모님과 절연한 지 10년… 저만 이런 건 아니죠?' })),
    ],
    ['MODEL_ERROR', () => deps({ callModel: vi.fn().mockRejectedValue(new Error('boom')) } as never)],
  ]

  for (const [reason, make] of cases) {
    it(`${reason}이면 seoTitle을 건드리지 않는다`, async () => {
      const d = make()
      const r = await runTitleRewrite(input(), d)
      expect(r.applied).toBe(false)
      expect(r.skipReason).toBe(reason)
      expect(d.prisma.post.update).not.toHaveBeenCalled()
    })
  }

  it('GATE_REJECTED(본문 80자 미만)에서도 seoTitle을 건드리지 않는다', async () => {
    const d = deps()
    const r = await runTitleRewrite(input({ body: '짧은 글' }), d)
    expect(r.skipReason).toBe('GATE_REJECTED')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('SOURCE_NOT_ALLOWED(shadow source)에서도 seoTitle을 건드리지 않는다', async () => {
    const d = deps()
    const r = await runTitleRewrite(input({ cafeId: 'yeowooya' }), d)
    expect(r.skipReason).toBe('SOURCE_NOT_ALLOWED')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })
})

describe('★ 기계 검증 — 모델의 자기 신고를 믿지 않는다', () => {
  it('본문에 없는 숫자가 들어가면 원제목 유지 (M4 "절연 10년" 유형)', async () => {
    const d = deps({}, modelOk({ rewrittenTitle: '부모님과 절연한 지 10년… 저만 이런 건 아니죠?', riskFlags: ['NONE'], confidence: 0.82 }))
    const r = await runTitleRewrite(input(), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('VALIDATION_FAILED')
    expect(r.validationReason).toBe('NUMBER_NOT_IN_SOURCE')
    expect(d.prisma.post.update).not.toHaveBeenCalled()
  })

  it('본문에 없는 명사가 들어가면 원제목 유지 (M4.5 "카드값" 유형)', () => {
    const v = validateRewrittenTitle('며느리 카드값 보고 손이 떨렸어요', ORIGINAL, BODY, ['NONE'])
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('ENTITY_NOT_IN_SOURCE')
  })

  it('의료 효과 단정은 거절한다', () => {
    const body = '마운자로 3펜째 맞고 있어요. 푸드노이즈가 없어진 점이 일단 좋습니다. 식욕은 주사 전의 절반 정도 되는 것 같아요. 부작용은 아직 크게 없네요.'
    const v = validateRewrittenTitle('마운자로 3펜 21일차, 푸드노이즈가 사라졌어요', '마운자로 3펜째. (21일차)', body)
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('MEDICAL_ASSERTION')
  })

  it('의료 유보 표현은 통과시키되 검수 대상으로 표시한다', () => {
    const body = '마운자로 3펜째 맞고 있어요. 푸드노이즈가 없어진 점이 일단 좋습니다. 식욕은 주사 전의 절반 정도 되는 것 같아요. 부작용은 아직 크게 없네요.'
    const v = validateRewrittenTitle('마운자로 3펜 21일차, 푸드노이즈 없어진 것 같아서 일단 좋음', '마운자로 3펜째. (21일차)', body)
    expect(v.ok).toBe(true)
    expect(v.humanReview).toContain('MEDICAL')
    expect(v.humanReview).toContain('MONEY_OR_PERIOD')
  })

  it('외부 카페 호칭이 제목에 남으면 거절한다 (치환 시 사실이 뒤집힌다)', () => {
    const body = '레테 인기글보니 요즘 남자들 일하는 부인을 좋아한다는 글이 많아서요. 갑자기 신랑한테 너무 미안한 생각이 들었어요. 결혼하며 쭈욱 전업이구요.'
    expect(validateRewrittenTitle('전업주부님들, 레테 보다가 신랑한테 미안해졌어요', '전업주부님들 계신가요', body).reason).toBe('CAFE_NAME_LEAK')
  })

  it('AI 블로그체·낚시·20~30대 말투·금지어를 거절한다', () => {
    const cases: [string, string][] = [
      ['갱년기 증상 완벽 정리 7가지', 'BLOGGY_OR_NEWSY'],
      ['로봇청소기 진짜 이거 실화예요?', 'BLOGGY_OR_NEWSY'],
      ['충격적인 시댁 반응 보고 놀랐어요', 'CLICKBAIT'],
      ['노년에 접어드니 서글퍼지네요 정말', 'BANNED_WORD'],
    ]
    for (const [title, reason] of cases) {
      expect(validateRewrittenTitle(title, ORIGINAL, BODY).reason).toBe(reason)
    }
  })

  it('길이·빈값·원제목 동일을 거절한다', () => {
    expect(validateRewrittenTitle('', ORIGINAL, BODY).reason).toBe('EMPTY')
    expect(validateRewrittenTitle('짧아요', ORIGINAL, BODY).reason).toBe('TOO_SHORT')
    expect(validateRewrittenTitle('가'.repeat(81), ORIGINAL, BODY).reason).toBe('TOO_LONG')
    expect(validateRewrittenTitle(ORIGINAL, ORIGINAL, BODY).reason).toBe('SAME_AS_ORIGINAL')
  })

  it('원제목에 있던 숫자는 유지해도 된다', () => {
    const body = '푸드노이즈가 없어진 점이 일단 좋습니다. 식욕도 줄었고 몸이 가벼워진 느낌이에요. 계속 지켜봐야 알 것 같아요. 다들 어떠신가요.'
    const v = validateRewrittenTitle('마운자로 3펜 21일차, 몸이 가벼워진 느낌이에요', '마운자로 3펜째. (21일차)', body)
    expect(v.ok).toBe(true)
  })

  it('M5 확정 제목 대표 케이스는 통과한다', () => {
    expect(validateRewrittenTitle(GOOD_TITLE, ORIGINAL, BODY).ok).toBe(true)
  })
})

describe('모델 응답 파싱', () => {
  it('앞뒤 설명이 붙어도 JSON을 뽑아낸다', () => {
    const r = parseTitleRewriteResponse('네, 결과입니다.\n{"decision":"REWRITE","rewrittenTitle":"제목입니다 여기요","confidence":0.9}\n이상입니다.')
    expect(r?.decision).toBe('REWRITE')
    expect(r?.confidence).toBe(0.9)
  })

  it('JSON이 없거나 decision이 이상하면 null', () => {
    expect(parseTitleRewriteResponse('설명만 있음')).toBeNull()
    expect(parseTitleRewriteResponse('{"decision":"MAYBE"}')).toBeNull()
    expect(parseTitleRewriteResponse('{깨진 json')).toBeNull()
  })
})

describe('★ 발행 경로 계약 — 발행 전에는 제목을 바꾸지 않는다', () => {
  const CURATOR = readFileSync(resolve(__dirname, '../../agents/cafe/content-curator.ts'), 'utf8')

  it('Post.create는 여전히 curated.title(원제목)로 만든다', () => {
    expect(CURATOR).toContain('title: curated.title')
  })

  it('slug는 여전히 curated.title에서 생성된다 (URL 불변)', () => {
    expect(CURATOR).toContain('generateCommunitySlug(curated.title)')
  })

  it('리라이팅은 트랜잭션이 끝난 뒤 호출된다', () => {
    const txEnd = CURATOR.indexOf('return post.id')
    const call = CURATOR.indexOf('await tryTitleRewrite(')
    expect(txEnd).toBeGreaterThan(0)
    expect(call).toBeGreaterThan(txEnd)
  })

  it('popular-curator는 이번 limited 대상이 아니다', () => {
    const pc = readFileSync(resolve(__dirname, '../../agents/cafe/popular-curator.ts'), 'utf8')
    expect(pc).not.toContain('title-rewrite-runner')
    expect(pc).not.toContain('runTitleRewrite')
  })

  it('프롬프트에 구체 문장 예시를 넣지 않는다 (M4.5 표절 사고 방지)', () => {
    const prompt = readFileSync(resolve(__dirname, '../../agents/cafe/title-rewrite-prompt.ts'), 'utf8')
    // 실제 사고를 낸 예시 문구가 프롬프트 본문에 남아 있으면 안 된다.
    // (주석의 사고 기록에는 등장하므로 SYSTEM 상수 안쪽만 본다)
    const sys = prompt.slice(prompt.indexOf('TITLE_REWRITE_SYSTEM'), prompt.indexOf('export interface TitleRewritePromptInput'))
    expect(sys).not.toContain('딸 카드값')
    expect(sys).not.toContain('손이 떨리')
  })
})

describe('★ P0-3 — seoDescription 고유화', () => {
  /**
   * 신규 발행글의 seoDescription 98%가 본문 앞부분 복사다(최근 7일 641건 실측).
   * 검증을 통과한 설명문만 덮어쓰고, 실패하면 기존 값(원문 발췌)이 그대로 남는다.
   *
   * ⚠️ 핵심 계약: description 검증 실패가 title 적용을 막지 않는다.
   */
  const GOOD_DESC =
    '나이 많은 신입으로 들어갔는데 텃새를 겪고 있습니다. 메모하는 방식까지 지적받으니 마음이 상했고, 계속 다녀야 할지 아니면 그만두는 게 나을지 고민이 깊어집니다.'
  /** 본문 첫 문장 복붙 — DESC_COPIED_FROM_SOURCE로 걸려야 한다 */
  const COPIED_DESC = BODY.replace(/\s+/g, ' ').trim().slice(0, 90)

  it('REWRITE + 유효 description → title·seoTitle·seoDescription 모두 적용', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: GOOD_DESC })))

    expect(r.applied).toBe(true)
    expect(r.descApplied).toBe(true)
    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.title).toBe(GOOD_TITLE)
    expect(arg.data.seoTitle).toBe(GOOD_TITLE)
    expect(arg.data.seoDescription).toBe(GOOD_DESC)
  })

  it('★ REWRITE + 무효 description → title·seoTitle은 적용, seoDescription만 제외', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: COPIED_DESC })))

    expect(r.applied).toBe(true) // ← description 실패가 title 적용을 막지 않는다
    expect(r.descApplied).toBe(false)
    expect(r.descSkipReason).toBe('DESC_COPIED_FROM_SOURCE')
    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.title).toBe(GOOD_TITLE)
    expect(arg.data.seoTitle).toBe(GOOD_TITLE)
    expect(arg.data).not.toHaveProperty('seoDescription') // 키 자체가 없다 = 기존 값 유지
  })

  it('모델이 description을 주지 않으면 시도 자체를 하지 않는다', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk()))

    expect(r.applied).toBe(true)
    expect(r.descApplied).toBeNull()
    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data).not.toHaveProperty('seoDescription')
  })

  it('★ MODEL_KEEP + 유효 description → title 미변경, seoDescription만 UPDATE', async () => {
    const repo = makeRepo()
    const d = deps({ prisma: repo }, modelOk({ decision: 'KEEP', rewrittenTitle: '', seoDescription: GOOD_DESC }))
    const r = await runTitleRewrite(input(), d)

    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('MODEL_KEEP')
    expect(r.descApplied).toBe(true)
    expect(repo.post.update).toHaveBeenCalledTimes(1)
    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data).toEqual({ seoDescription: GOOD_DESC }) // title·slug는 손대지 않는다
  })

  it('★ MODEL_KEEP + 무효 description → update 자체가 없다', async () => {
    const repo = makeRepo()
    const d = deps({ prisma: repo }, modelOk({ decision: 'KEEP', rewrittenTitle: '', seoDescription: COPIED_DESC }))
    const r = await runTitleRewrite(input(), d)

    expect(r.skipReason).toBe('MODEL_KEEP')
    expect(r.descApplied).toBe(false)
    expect(repo.post.update).not.toHaveBeenCalled()
  })

  it('MODEL_REJECT면 description도 만들지 않는다', async () => {
    const repo = makeRepo()
    const d = deps({ prisma: repo }, modelOk({ decision: 'REJECT', rewrittenTitle: '', seoDescription: GOOD_DESC }))
    const r = await runTitleRewrite(input(), d)

    expect(r.skipReason).toBe('MODEL_REJECT')
    expect(repo.post.update).not.toHaveBeenCalled()
  })

  it('KEEP 경로의 update가 실패해도 예외를 던지지 않는다 (발행 무영향)', async () => {
    const repo = makeRepo()
    repo.post.update = vi.fn().mockRejectedValue(new Error('DB write 실패'))
    const d = deps({ prisma: repo }, modelOk({ decision: 'KEEP', rewrittenTitle: '', seoDescription: GOOD_DESC }))
    const r = await runTitleRewrite(input(), d)

    expect(r.skipReason).toBe('MODEL_KEEP')
    expect(r.descApplied).toBe(false)
  })

  it('slug·content·originalTitle 계약은 그대로다', async () => {
    const repo = makeRepo()
    await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: GOOD_DESC })))

    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    for (const forbidden of ['slug', 'content', 'summary', 'publishedAt', 'status']) {
      expect(arg.data).not.toHaveProperty(forbidden)
    }
    expect(arg.data.originalTitle).toBe(ORIGINAL)
    expect(Object.keys(arg.data).sort()).toEqual(['originalTitle', 'seoDescription', 'seoTitle', 'title'])
  })
})

describe('★ P0-4 — 거부된 seoDescription 관찰 로깅', () => {
  /**
   * ## 왜 이 테스트가 있나
   *
   * 09:50~12:05 실측에서 desc applied 7건 / skipped 6건이었고, skip 6건 중 **5건(83%)이
   * DESC_TOO_LONG**이었다. 통과한 값은 116~128자로 당시 상한(130자) 바로 아래에 몰려 있다.
   * (이 관찰이 쌓여 2026-08-18 상한이 140으로 완화됐다 — 아래는 그 이후 기준의 테스트다.)
   *
   * 그런데 거부된 값은 DB에 저장되지 않고 로그에도 사유만 남아서, **131자라 아깝게 잘린 건지
   * 180자라 장황한 건지 구분할 방법이 없다.** 근거가 없으니 상한을 조정할 수도 없다.
   *
   * P0-4는 그 근거를 만드는 **관찰 장치**다. 판정 기준·update 조건은 한 글자도 바꾸지 않는다.
   *
   * ## 이 테스트가 지키는 것
   *
   * 1. 거부 로그에 len과 preview가 실린다 (REWRITE·MODEL_KEEP 양쪽)
   * 2. preview는 짧게 잘리고, 개행·연속공백이 접히고, 따옴표로 로그를 깨지 않는다
   * 3. description 전문이 로그로 새지 않는다 (개인사 노출 방지)
   * 4. 적용·update 동작은 P0-3 그대로다
   */
  const GOOD_DESC =
    '나이 많은 신입으로 들어갔는데 텃새를 겪고 있습니다. 메모하는 방식까지 지적받으니 마음이 상했고, 계속 다녀야 할지 아니면 그만두는 게 나을지 고민이 깊어집니다.'
  /**
   * 141자 — 상한(140자)을 한 자 넘긴다.
   * 상한 130→140 완화(2026-08-18, P0-4 판단) 이후에도 여전히 거부되는 최소 초과 케이스다.
   */
  const TOO_LONG_DESC =
    '추석 음식을 어디까지 준비해야 하는지를 두고 남편과 부딪친 이야기입니다. 예비 사위와 딸이 오는데 그냥 삼겹살만 굽자고 하니 서운했고, 하필 추석 당일이 남편 생일이기까지 해서 마음이 더 복잡해졌다고 조심스럽게 털어놓는 글입니다. 다들 어떻게 하시나요?'
  const COPIED_DESC = BODY.replace(/\s+/g, ' ').trim().slice(0, 90)

  const logOf = (o: TitleRewriteOutcome) => formatTitleRewriteLog('post-1', o)

  it('TOO_LONG 테스트 데이터가 실제로 상한을 넘는지 (전제 확인)', () => {
    expect(TOO_LONG_DESC.length).toBeGreaterThan(140)
    expect(TOO_LONG_DESC.length).toBeLessThan(160) // 141~159 구간 — 완화 후에도 거부되는 영역
  })

  it('★ DESC_TOO_LONG skip 로그에 len과 preview가 포함된다', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: TOO_LONG_DESC })))

    expect(r.descApplied).toBe(false)
    expect(r.descSkipReason).toBe('DESC_TOO_LONG')
    expect(r.descLength).toBe(TOO_LONG_DESC.length)
    expect(r.descPreview).not.toBeNull()

    const log = logOf(r)
    expect(log).toContain('desc=skipped(DESC_TOO_LONG')
    expect(log).toContain(`len=${TOO_LONG_DESC.length}`)
    expect(log).toMatch(/preview="[^"]+"/)
  })

  it('★ DESC_COPIED_FROM_SOURCE skip 로그에도 len과 preview가 포함된다', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: COPIED_DESC })))

    expect(r.descSkipReason).toBe('DESC_COPIED_FROM_SOURCE')
    expect(r.descLength).toBe(COPIED_DESC.length)
    const log = logOf(r)
    expect(log).toContain(`desc=skipped(DESC_COPIED_FROM_SOURCE len=${COPIED_DESC.length} preview="`)
  })

  it('★ MODEL_KEEP 경로의 desc skip 로그에도 len과 preview가 포함된다', async () => {
    const repo = makeRepo()
    const d = deps({ prisma: repo }, modelOk({ decision: 'KEEP', rewrittenTitle: '', seoDescription: TOO_LONG_DESC }))
    const r = await runTitleRewrite(input(), d)

    expect(r.skipReason).toBe('MODEL_KEEP')
    expect(r.descApplied).toBe(false)
    expect(r.descLength).toBe(TOO_LONG_DESC.length)
    expect(r.descPreview).not.toBeNull()

    const log = logOf(r)
    expect(log).toContain('skip(MODEL_KEEP)')
    expect(log).toContain(`desc=skipped(DESC_TOO_LONG len=${TOO_LONG_DESC.length} preview="`)
    expect(repo.post.update).not.toHaveBeenCalled() // update 조건은 P0-3 그대로
  })

  it('★ description 전문이 로그에 그대로 노출되지 않는다', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: TOO_LONG_DESC })))

    const log = logOf(r)
    expect(log).not.toContain(TOO_LONG_DESC) // 전문 금지
    expect(r.descPreview!.length).toBeLessThan(TOO_LONG_DESC.length)
  })

  it('★ preview는 60자를 넘지 않는다 (절단 표시 포함)', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: TOO_LONG_DESC })))

    expect(DESC_PREVIEW_MAX_CHARS).toBeLessThanOrEqual(60)
    expect(r.descPreview!.length).toBeLessThanOrEqual(60)
    expect(r.descPreview!.length).toBeLessThanOrEqual(DESC_PREVIEW_MAX_CHARS + 1) // +1 = '…'
  })

  it('★ preview의 줄바꿈·연속 공백이 한 칸으로 정규화된다', () => {
    const messy = '첫 줄입니다.\n\n둘째   줄이고요.\t셋째 줄.'
    const out = previewForLog(messy)
    expect(out).toBe('첫 줄입니다. 둘째 줄이고요. 셋째 줄.')
    expect(out).not.toMatch(/[\n\t]/)
    expect(out).not.toMatch(/ {2}/)
  })

  it('★ preview의 큰따옴표가 치환된다 — 로그 한 줄 계약이 깨지지 않는다', () => {
    const quoted = '남편이 "하지 말라"고 했다는 이야기'
    const out = previewForLog(quoted)
    expect(out).not.toContain('"')
    expect(out).toContain("'하지 말라'")
    // 로그에 실었을 때 preview="..." 구조가 유지되는지
    const log = formatTitleRewriteLog('post-1', {
      applied: false, skipReason: 'MODEL_KEEP', detail: 'd', originalTitle: ORIGINAL, newTitle: null,
      humanReview: [], validationReason: null, promptVersion: 'v', modelRiskFlags: [], styleType: null,
      confidence: null, descApplied: false, descSkipReason: 'DESC_TOO_LONG', descLength: 140, descPreview: out,
    })
    expect(log.match(/"/g)!.length).toBe(2) // preview를 감싸는 따옴표 딱 2개
  })

  it('preview는 짧은 문장을 자르지 않는다', () => {
    const short = '짧은 설명문입니다.'
    expect(previewForLog(short)).toBe(short)
    expect(previewForLog(short)).not.toContain('…')
  })

  it('★ desc applied 로그는 len만 붙고 preview는 붙지 않는다 (통과분은 DB에서 볼 수 있다)', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: GOOD_DESC })))

    expect(r.descApplied).toBe(true)
    expect(r.descLength).toBe(GOOD_DESC.length)
    expect(r.descPreview).toBeNull()

    const log = logOf(r)
    expect(log).toContain(`desc=applied len=${GOOD_DESC.length}`)
    expect(log).not.toContain('preview=')
  })

  it('모델이 description을 안 주면 len·preview 모두 null이고 로그에도 안 나온다', async () => {
    const repo = makeRepo()
    const r = await runTitleRewrite(input(), deps({ prisma: repo }, modelOk()))

    expect(r.descLength).toBeNull()
    expect(r.descPreview).toBeNull()
    expect(logOf(r)).not.toContain('desc=')
  })

  it('★ P0-3 update 계약은 그대로다 — 로깅이 저장 로직을 건드리지 않았다', async () => {
    const repo = makeRepo()
    // 거부되는 description을 줘도 title·seoTitle은 그대로 적용된다
    await runTitleRewrite(input(), deps({ prisma: repo }, modelOk({ seoDescription: TOO_LONG_DESC })))

    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.title).toBe(GOOD_TITLE)
    expect(arg.data.seoTitle).toBe(GOOD_TITLE)
    expect(arg.data).not.toHaveProperty('seoDescription')
    expect(Object.keys(arg.data).sort()).toEqual(['originalTitle', 'seoTitle', 'title'])
    for (const forbidden of ['slug', 'content', 'summary', 'publishedAt', 'status']) {
      expect(arg.data).not.toHaveProperty(forbidden)
    }
  })
})
