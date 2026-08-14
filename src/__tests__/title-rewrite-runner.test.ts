import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  countTodayRewrites,
  getTitleRewriteDailyLimit,
  getTitleRewriteSources,
  isTitleRewriteEnabled,
  parseTitleRewriteResponse,
  runTitleRewrite,
  MIN_CONFIDENCE,
  type TitleRewriteDeps,
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

  it('환경변수에 다른 source를 넣어도 gate가 wgang 외를 막는다', async () => {
    // 이중 방어: env를 잘못 켜도 gate(TITLE_REWRITE_SOURCES=wgang)가 REJECT한다
    const env = { ...ENV_ON, TITLE_REWRITE_SOURCES: 'wgang,remonterrace' } as unknown as NodeJS.ProcessEnv
    const d = deps({ env })
    const r = await runTitleRewrite(input({ cafeId: 'remonterrace' }), d)
    expect(r.applied).toBe(false)
    expect(r.skipReason).toBe('GATE_REJECTED')
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

  it('오늘 자정 이후만 센다', async () => {
    const repo = makeRepo({ count: 2 })
    const n = await countTodayRewrites(repo, new Date('2026-08-15T15:30:00+09:00'))
    expect(n).toBe(2)
    const arg = repo.post.count.mock.calls[0][0] as { where: { originalTitle: unknown; updatedAt: { gte: Date } } }
    expect(arg.where.originalTitle).toEqual({ not: null })
    expect(arg.where.updatedAt.gte.getHours()).toBe(0)
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

  it('★ slug·seoTitle·content·publishedAt을 절대 업데이트하지 않는다', async () => {
    const repo = makeRepo()
    await runTitleRewrite(input(), deps({ prisma: repo }))

    const arg = repo.post.update.mock.calls[0][0] as { data: Record<string, unknown> }
    for (const forbidden of ['slug', 'seoTitle', 'seoDescription', 'content', 'summary', 'publishedAt', 'status']) {
      expect(arg.data).not.toHaveProperty(forbidden)
    }
    expect(Object.keys(arg.data).sort()).toEqual(['originalTitle', 'title'])
  })

  it('Post를 찾지 못하면 update하지 않는다', async () => {
    const repo = makeRepo()
    repo.post.findUnique = vi.fn().mockResolvedValue(null)
    const r = await runTitleRewrite(input(), deps({ prisma: repo }))
    expect(r.skipReason).toBe('UPDATE_FAILED')
    expect(repo.post.update).not.toHaveBeenCalled()
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
