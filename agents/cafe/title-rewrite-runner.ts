/**
 * 제목 리라이팅 limited 실행기 (2026-08-14, PR-D)
 *
 * ## 이 파일의 계약 — 어떤 실패도 발행을 막지 않는다
 *
 * 🚫 **제목 리라이팅 실패는 발행 실패가 아니다.**
 *   플래그 OFF · gate 제외 · 한도 초과 · 모델 오류 · 검증 실패 —
 *   무엇이 어긋나든 글은 **원제목으로 정상 발행된 상태 그대로** 남는다.
 *   이 파일의 모든 경로는 `applied: false`를 돌려줄 뿐 예외를 위로 던지지 않는다.
 *
 * ## 발행 후 UPDATE만 한다
 *
 * 발행 **전에** title을 바꾸면 `slug`와 `seoTitle`이 함께 바뀐다.
 *   content-curator.ts   slug = generateCommunitySlug(curated.title)
 *   popular-seo.ts       seoTitle = cutAtWord(title, 55)
 * `slug`는 @unique이고 URL을 결정하며, `seoTitle`은 검색 노출 제목이 된다.
 * 둘 다 네이버 노출면이다(CLAUDE.md seo-guard 보호 영역).
 *
 * 그래서 **원제목으로 발행을 끝낸 뒤 `title`만** 업데이트한다.
 * URL·검색 제목은 원제목 기반으로 남고, 화면 제목만 개선된다.
 * 사고가 나면 `originalTitle`로 되돌리면 끝이다.
 *
 * ## 기본값은 OFF
 * `TITLE_REWRITE_ENABLED=true`가 명시적으로 켜지지 않으면 아무 일도 하지 않는다.
 */
import { evaluateTitleRewriteCandidate, type RewriteGateInput } from './title-rewrite-gate.js'
import { validateRewrittenTitle, validateSeoDescription, type HumanReviewFlag, type TitleValidationReason } from './title-rewrite-validate.js'
import {
  buildTitleRewritePrompt,
  TITLE_REWRITE_PROMPT_VERSION,
  TITLE_REWRITE_SYSTEM,
  type TitleRewritePromptInput,
} from './title-rewrite-prompt.js'

// ─────────────────────────────────────────────────────────────
// 설정 — 환경변수. 이 PR에서는 .env를 수정하지 않는다.
// ─────────────────────────────────────────────────────────────

/** 기본 OFF. 명시적으로 'true'일 때만 동작한다 */
export function isTitleRewriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.TITLE_REWRITE_ENABLED ?? '').trim().toLowerCase() === 'true'
}

/** 적용 source — 기본 wgang 단독. gate의 TITLE_REWRITE_SOURCES와 이중으로 확인한다 */
export function getTitleRewriteSources(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = (env.TITLE_REWRITE_SOURCES ?? 'wgang').trim()
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** 하루 상한 — 기본 5건. 0 이하·파싱 실패면 5로 둔다 */
export function getTitleRewriteDailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt((env.TITLE_REWRITE_DAILY_LIMIT ?? '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : 5
}

/** 이 값보다 낮으면 적용하지 않는다 — 모델이 스스로 자신 없다고 한 건 굳이 쓰지 않는다 */
export const MIN_CONFIDENCE = 0.6

/** 모델 호출 상한 — 발행 흐름을 오래 잡지 않는다 */
export const MODEL_TIMEOUT_MS = 20_000

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

export type TitleRewriteSkipReason =
  | 'FLAG_OFF'
  | 'SOURCE_NOT_ALLOWED'
  | 'GATE_REJECTED'
  | 'DAILY_LIMIT_REACHED'
  | 'LIMIT_COUNT_FAILED'
  | 'MODEL_ERROR'
  | 'MODEL_TIMEOUT'
  | 'MODEL_PARSE_FAILED'
  | 'MODEL_KEEP'
  | 'MODEL_REJECT'
  | 'LOW_CONFIDENCE'
  | 'VALIDATION_FAILED'
  | 'UPDATE_FAILED'

export interface TitleRewriteOutcome {
  applied: boolean
  skipReason: TitleRewriteSkipReason | null
  detail: string
  originalTitle: string
  newTitle: string | null
  humanReview: HumanReviewFlag[]
  validationReason: TitleValidationReason | null
  promptVersion: string
  /** 모델이 스스로 단 신호 — 신뢰하지 않되 로그에는 남긴다 */
  modelRiskFlags: string[]
  styleType: string | null
  confidence: number | null
  /** P0-3 — seoDescription 적용 결과. null = 시도 안 함 */
  descApplied: boolean | null
  descSkipReason: string | null
  /**
   * P0-4 — 모델이 실제로 생성한 seoDescription의 길이. null = 모델이 값을 안 줌.
   *
   * 거부된 값은 DB에 남지 않아 사후 검증이 불가능하다. 길이만이라도 로그에 남겨야
   * "130자 상한이 빡센 건지(131~140자), 모델이 장황한 건지(160자+)"를 구분할 수 있다.
   */
  descLength: number | null
  /** P0-4 — 거부된 seoDescription의 앞부분(정규화·절단). 검증 실패 시에만 채운다. */
  descPreview: string | null
}

/** 모델 응답 — 파싱 실패 시 null */
export interface TitleRewriteModelResult {
  decision: 'REWRITE' | 'KEEP' | 'REJECT'
  rewrittenTitle: string
  /** P0-3 — 검색 결과 설명문. decision과 무관하게 채워진다(REJECT 제외) */
  seoDescription?: string
  reason?: string
  sourceSignals?: string[]
  styleType?: string
  riskFlags?: string[]
  confidence?: number
}

/** 모델 호출부 — 테스트에서 mock으로 갈아끼운다 */
export type TitleRewriteModelCaller = (
  system: string,
  user: string,
  timeoutMs: number,
) => Promise<TitleRewriteModelResult | null>

export interface TitleRewriteRunInput {
  postId: string
  cafeId: string
  /** 발행된 제목 = 원제목 */
  publishedTitle: string
  /** 원문 본문 plain text */
  body: string
  author?: string | null
  isUsable?: boolean
  commentCount?: number
  likeCount?: number
  boardName?: string | null
  desireCategory?: string | null
  emotionTags?: readonly string[]
  psychInsight?: string | null
}

/**
 * 필요한 Prisma 연산만 구조적으로 받는다.
 * ⚠️ `PrismaClient` 타입을 직접 쓰지 않는 이유: agents/ 는 tsconfig.ops 기준에서
 *   prisma 인스턴스가 `unknown`으로 잡힌다(기존 baseline 953건의 성격). 구조 타입이면
 *   호출부에서 그대로 넘길 수 있고, 테스트에서 mock을 끼우기도 쉽다.
 */
export interface TitleRewritePostRepo {
  count: (args: unknown) => Promise<number>
  findUnique: (args: unknown) => Promise<{ title: string; originalTitle: string | null } | null>
  update: (args: unknown) => Promise<unknown>
}

export interface TitleRewriteDeps {
  prisma: { post: TitleRewritePostRepo }
  callModel: TitleRewriteModelCaller
  env?: NodeJS.ProcessEnv
  /** 테스트에서 날짜를 고정하기 위해 주입 가능 */
  now?: () => Date
}

const skip = (
  reason: TitleRewriteSkipReason,
  detail: string,
  originalTitle: string,
  extra: Partial<TitleRewriteOutcome> = {},
): TitleRewriteOutcome => ({
  applied: false,
  skipReason: reason,
  detail,
  originalTitle,
  newTitle: null,
  humanReview: [],
  validationReason: null,
  promptVersion: TITLE_REWRITE_PROMPT_VERSION,
  modelRiskFlags: [],
  styleType: null,
  confidence: null,
  descApplied: null,
  descSkipReason: null,
  descLength: null,
  descPreview: null,
  ...extra,
})

/** P0-4 — 로그 preview 상한. 40~60자 구간에서 고른 값이며, 절단 표시 `…`를 붙여도 60자를 넘지 않는다. */
export const DESC_PREVIEW_MAX_CHARS = 50

/**
 * P0-4 — 거부된 설명문을 로그에 남기기 위한 안전 가공.
 *
 * 전문을 남기지 않는 이유는 두 가지다.
 *   1. 원문에서 끌어온 문장이라 개인사가 길게 노출될 수 있다
 *   2. 개행·따옴표가 섞이면 로그 한 줄 계약이 깨진다
 *
 * 그래서 공백을 한 칸으로 접고, 큰따옴표는 작은따옴표로 바꾸고, 앞부분만 남긴다.
 */
export function previewForLog(raw: string, max: number = DESC_PREVIEW_MAX_CHARS): string {
  const flat = raw.replace(/\s+/g, ' ').replace(/"/g, "'").trim()
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/**
 * P0-3 — seoDescription 갱신 여부를 판단한다.
 *
 * 검증 실패는 **title 적용을 막지 않는다.** 값이 없으면 기존 seoDescription(원문 발췌)이
 * 그대로 남고, 그건 지금까지의 동작과 같다 — 안전한 축퇴다.
 *
 * P0-4에서 length·preview를 함께 돌려준다. **판정 기준은 한 글자도 바뀌지 않았다** —
 * 거부된 값이 어떤 모양이었는지 로그로 볼 수 있게 하는 관찰 장치일 뿐이다.
 *
 * @returns update data에 합칠 조각 + 로그용 결과
 */
function resolveSeoDescription(
  model: TitleRewriteModelResult,
  effectiveTitle: string,
  originalTitle: string,
  body: string,
): {
  patch: { seoDescription?: string }
  applied: boolean | null
  skipReason: string | null
  length: number | null
  preview: string | null
} {
  const raw = (model.seoDescription ?? '').trim()
  // 모델이 안 준 경우 — 시도 자체를 안 함. 남길 길이도 없다.
  if (!raw) return { patch: {}, applied: null, skipReason: null, length: null, preview: null }

  const v = validateSeoDescription(raw, effectiveTitle, originalTitle, body)
  // 거부분만 preview를 남긴다. 통과분은 DB(seoDescription)에서 언제든 원문을 볼 수 있다.
  if (!v.ok) {
    return { patch: {}, applied: false, skipReason: v.reason, length: raw.length, preview: previewForLog(raw) }
  }
  return { patch: { seoDescription: raw }, applied: true, skipReason: null, length: raw.length, preview: null }
}

/** KST(UTC+9) 고정 오프셋 — 한국은 서머타임이 없어 상수로 충분하다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * `now`가 속한 **한국시간 하루의 시작**을 UTC Date로 돌려준다.
 *
 * `Date.prototype.setHours(0,0,0,0)`를 쓰지 않는 이유: 그건 **서버 로컬 타임존** 기준이라
 * GHA(ubuntu-latest, TZ=UTC)에서는 하루 경계가 KST 09:00에 그어진다. 큐레이션 슬롯이
 * 08:20~01:15 KST라 "오늘"이 운영 의도와 어긋난다. 여기서는 서버 TZ와 무관하게 계산한다.
 */
export function kstStartOfDayUtc(now: Date): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS) // UTC 필드를 KST 벽시계로 읽기 위한 이동
  const kstMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  )
  return new Date(kstMidnight - KST_OFFSET_MS) // 다시 실제 UTC 시각으로
}

/**
 * 오늘(KST) 이미 리라이팅한 건수를 센다.
 *
 * 별도 카운터 테이블을 만들지 않는다 — `originalTitle IS NOT NULL`이 곧 "리라이팅됨"이다.
 * 세는 데 실패하면 **보수적으로 skip**한다(한도를 모르면 쓰지 않는다).
 *
 * ⚠️ 날짜 기준은 `createdAt`이다. `updatedAt`을 쓰면 안 된다.
 *    `Post.updatedAt`은 리라이팅과 무관한 UPDATE(댓글 wave 연동·지표 갱신 등)로도 갱신되므로,
 *    어제 적용분이 오늘 카운트에 계속 잡혀 **스스로를 DAILY_LIMIT_REACHED로 영구 차단**한다.
 *    (2026-08-16 실측: 오늘 적용 0건인데 카운트 10 → 상한 10에 걸려 하루 종일 skip.
 *     당시 updatedAt은 발행 후 25~34시간까지 밀려 있었다.)
 *
 *    `createdAt`을 쓸 수 있는 근거: 리라이팅은 `content-curator.ts`의 발행 직후
 *    `tryTitleRewrite` 한 곳에서만 실행된다. 즉 `createdAt ≈ 리라이팅 시각`이고,
 *    `createdAt`은 불변이라 오염되지 않는다. 이 전제는 계약 테스트로 고정돼 있다.
 */
export async function countTodayRewrites(
  prisma: { post: TitleRewritePostRepo },
  now: Date,
): Promise<number | null> {
  const start = kstStartOfDayUtc(now)
  try {
    return await prisma.post.count({
      where: { originalTitle: { not: null }, createdAt: { gte: start } },
    })
  } catch (err) {
    console.warn('[TitleRewrite] 일일 카운트 실패 — 보수적으로 skip:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 발행이 끝난 Post 하나에 대해 제목 리라이팅을 시도한다.
 * 어떤 경우에도 예외를 던지지 않는다 — 호출부의 발행 결과에 영향을 주면 안 된다.
 */
export async function runTitleRewrite(
  input: TitleRewriteRunInput,
  deps: TitleRewriteDeps,
): Promise<TitleRewriteOutcome> {
  const env = deps.env ?? process.env
  const now = (deps.now ?? (() => new Date()))()
  const original = input.publishedTitle

  // ── 1) 플래그 — 기본 OFF ──
  if (!isTitleRewriteEnabled(env)) {
    return skip('FLAG_OFF', 'TITLE_REWRITE_ENABLED가 켜져 있지 않다', original)
  }

  // ── 2) source — 환경변수와 gate 상수를 이중으로 본다 ──
  if (!getTitleRewriteSources(env).includes(input.cafeId)) {
    return skip('SOURCE_NOT_ALLOWED', `${input.cafeId}는 TITLE_REWRITE_SOURCES 밖`, original)
  }

  // ── 3) 후보 gate (PR #372·#374) ──
  const gateInput: RewriteGateInput = {
    cafeId: input.cafeId,
    title: original,
    content: input.body,
    author: input.author,
    isUsable: input.isUsable,
    commentCount: input.commentCount,
    desireCategory: input.desireCategory,
    emotionTags: input.emotionTags,
    psychInsight: input.psychInsight,
  }
  const gate = evaluateTitleRewriteCandidate(gateInput)
  if (!gate.eligible) {
    return skip('GATE_REJECTED', `${gate.reason}: ${gate.detail}`, original)
  }

  // ── 4) 하루 상한 ──
  const limit = getTitleRewriteDailyLimit(env)
  const todayCount = await countTodayRewrites(deps.prisma, now)
  if (todayCount === null) {
    return skip('LIMIT_COUNT_FAILED', '일일 카운트 실패 — 안전하게 건너뛴다', original)
  }
  if (todayCount >= limit) {
    return skip('DAILY_LIMIT_REACHED', `오늘 ${todayCount}건 — 상한 ${limit}건`, original)
  }

  // ── 5) 모델 호출 ──
  const promptInput: TitleRewritePromptInput = {
    title: original,
    body: input.body,
    boardName: input.boardName,
    commentCount: input.commentCount,
    likeCount: input.likeCount,
    desireCategory: input.desireCategory,
    emotionTags: input.emotionTags,
    psychInsight: input.psychInsight,
    gateSignals: gate.signals,
  }
  let model: TitleRewriteModelResult | null
  try {
    model = await deps.callModel(TITLE_REWRITE_SYSTEM, buildTitleRewritePrompt(promptInput), MODEL_TIMEOUT_MS)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const timedOut = /timeout|aborted|ETIMEDOUT/i.test(msg)
    return skip(timedOut ? 'MODEL_TIMEOUT' : 'MODEL_ERROR', msg.slice(0, 120), original)
  }
  if (!model) return skip('MODEL_PARSE_FAILED', '모델 응답을 파싱하지 못했다', original)

  const riskFlags = model.riskFlags ?? []
  const meta = {
    modelRiskFlags: riskFlags,
    styleType: model.styleType ?? null,
    confidence: model.confidence ?? null,
  }

  if (model.decision === 'KEEP') {
    // P0-3: 제목은 그대로 두되 설명문은 새로 쓴다.
    //   실측(2026-08-16~17) 모델 호출의 40%가 KEEP이다. 여기서 아무것도 안 하면
    //   description 개선 기회의 40%를 버리게 된다. decision은 '제목에 대한 판단'일 뿐이다.
    const d = resolveSeoDescription(model, original, original, input.body)
    if (d.patch.seoDescription) {
      try {
        await deps.prisma.post.update({
          where: { id: input.postId },
          data: { seoDescription: d.patch.seoDescription }, // title·slug는 건드리지 않는다
        })
      } catch (err) {
        return skip('MODEL_KEEP', '모델이 원제목 유지를 택했다 — 판단력이지 실패가 아니다', original, {
          ...meta,
          descApplied: false,
          descSkipReason: `UPDATE_FAILED: ${err instanceof Error ? err.message.slice(0, 80) : 'update 실패'}`,
          // 검증은 통과했고 DB만 실패한 경우다 — 길이는 남기되 preview는 남기지 않는다.
          descLength: d.length,
        })
      }
    }
    return skip('MODEL_KEEP', '모델이 원제목 유지를 택했다 — 판단력이지 실패가 아니다', original, {
      ...meta,
      descApplied: d.applied,
      descSkipReason: d.skipReason,
      descLength: d.length,
      descPreview: d.preview,
    })
  }
  if (model.decision === 'REJECT') {
    return skip('MODEL_REJECT', '모델이 리라이팅 대상이 아니라고 판단했다', original, meta)
  }
  if ((model.confidence ?? 1) < MIN_CONFIDENCE) {
    return skip('LOW_CONFIDENCE', `confidence ${model.confidence} < ${MIN_CONFIDENCE}`, original, meta)
  }

  // ── 6) 기계 검증 — 모델의 자기 신고를 믿지 않는다 ──
  const v = validateRewrittenTitle(model.rewrittenTitle ?? '', original, input.body, riskFlags)
  if (!v.ok) {
    return skip('VALIDATION_FAILED', `${v.reason}: ${v.detail}`, original, {
      ...meta,
      validationReason: v.reason,
    })
  }

  // ── 7) title + seoTitle UPDATE. slug는 절대 건드리지 않는다 ──
  //
  // seoTitle을 함께 쓰는 이유(P0-2, 2026-08-16): 커뮤니티 상세 페이지의 generateMetadata는
  // `post.seoTitle ?? post.title`을 <title>·OG title·Twitter title에 쓴다. seoTitle이
  // 원제목으로 남아 있는 한 리라이팅 제목은 화면 H1에만 보이고 **검색엔진에는 한 글자도
  // 전달되지 않는다**(실측: 적용 10건 전부 <title>이 원제목이었다).
  //
  // slug는 여전히 제외한다 — URL이 바뀌면 기존 색인·canonical이 끊긴다.
  // seoTitle만 바꾸면 URL은 그대로 둔 채 검색 제목만 갱신되므로 색인 충격이 없다.
  // seoDescription도 이번에는 건드리지 않는다(별도 작업).
  const newTitle = model.rewrittenTitle.trim()
  let desc: ReturnType<typeof resolveSeoDescription> = {
    patch: {}, applied: null, skipReason: null, length: null, preview: null,
  }
  try {
    const current = await deps.prisma.post.findUnique({
      where: { id: input.postId },
      select: { title: true, originalTitle: true },
    })
    if (!current) return skip('UPDATE_FAILED', 'Post를 찾지 못했다', original, meta)

    // P0-3 — 설명문은 검증을 통과했을 때만 함께 갱신한다.
    //   실패해도 title/seoTitle 적용은 그대로 간다(조건부 스프레드). 값이 없으면
    //   기존 seoDescription이 남고, 그건 지금까지의 동작과 같다.
    desc = resolveSeoDescription(model, newTitle, original, input.body)

    await deps.prisma.post.update({
      where: { id: input.postId },
      data: {
        title: newTitle,
        // 검색엔진이 실제로 읽는 제목 — 이게 있어야 리라이팅이 SEO에 반영된다
        seoTitle: newTitle,
        // ★ 이미 있으면 덮어쓰지 않는다 — 최초 원본을 영구 보존한다
        originalTitle: current.originalTitle ?? current.title,
        // 검증을 통과한 경우에만 설명문을 덮어쓴다 (P0-3)
        ...desc.patch,
        // slug는 의도적으로 제외한다 (URL·canonical 불변)
      },
    })
  } catch (err) {
    return skip('UPDATE_FAILED', err instanceof Error ? err.message.slice(0, 120) : 'update 실패', original, meta)
  }

  return {
    applied: true,
    skipReason: null,
    descApplied: desc.applied,
    descSkipReason: desc.skipReason,
    descLength: desc.length,
    descPreview: desc.preview,
    detail: `제목 적용 — ${original.length}자 → ${newTitle.length}자`,
    originalTitle: original,
    newTitle,
    humanReview: v.humanReview,
    validationReason: null,
    promptVersion: TITLE_REWRITE_PROMPT_VERSION,
    ...meta,
  }
}

/**
 * 운영용 Sonnet 호출부.
 *
 * ⚠️ 이 함수는 **테스트에서 호출되지 않는다.** 테스트는 mock caller를 주입한다.
 *   실패는 전부 위에서 skip으로 흡수되므로 여기서 예외를 던져도 발행에는 영향이 없다.
 */
export interface TitleRewriteAnthropicLike {
  messages: { create: (p: never, o?: never) => Promise<unknown> }
}

export function createSonnetCaller(client: TitleRewriteAnthropicLike, model: string): TitleRewriteModelCaller {
  return async (system, user, timeoutMs) => {
    const params = { model, max_tokens: 1200, temperature: 1, system, messages: [{ role: 'user', content: user }] }
    const res = await client.messages.create(params as never, { timeout: timeoutMs } as never)
    const blocks = (res as { content?: { type: string; text?: string }[] }).content ?? []
    const text = blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    return parseTitleRewriteResponse(text)
  }
}

/** 모델 응답 텍스트 → 결과 객체. 파싱 실패는 null (호출부가 skip으로 처리한다) */
export function parseTitleRewriteResponse(text: string): TitleRewriteModelResult | null {
  const m = (text ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const p = JSON.parse(m[0]) as Partial<TitleRewriteModelResult>
    if (p.decision !== 'REWRITE' && p.decision !== 'KEEP' && p.decision !== 'REJECT') return null
    return {
      decision: p.decision,
      rewrittenTitle: typeof p.rewrittenTitle === 'string' ? p.rewrittenTitle : '',
      seoDescription: typeof p.seoDescription === 'string' ? p.seoDescription : undefined,
      reason: p.reason,
      sourceSignals: Array.isArray(p.sourceSignals) ? p.sourceSignals : [],
      styleType: typeof p.styleType === 'string' ? p.styleType : undefined,
      riskFlags: Array.isArray(p.riskFlags) ? p.riskFlags : [],
      confidence: typeof p.confidence === 'number' ? p.confidence : undefined,
    }
  } catch {
    return null
  }
}

/** 운영 로그 한 줄 — 사람이 훑어볼 수 있게 */
export function formatTitleRewriteLog(postId: string, o: TitleRewriteOutcome): string {
  // P0-3 — 설명문 적용 여부를 항상 남긴다. skip 경로(MODEL_KEEP)에서도 설명문은 갱신될 수 있다.
  //
  // P0-4 — 거부분에는 길이와 preview를 덧붙인다. 거부된 값은 DB에 남지 않으므로
  //   이 로그가 유일한 근거다. 이게 없으면 "131자라 아깝게 잘린 것"과 "180자라 장황한 것"을
  //   구분할 수 없고, 130자 상한을 조정할지 프롬프트를 죌지 결정할 수 없다.
  const len = o.descLength === null ? '' : ` len=${o.descLength}`
  const preview = o.descPreview === null ? '' : ` preview="${o.descPreview}"`
  const desc =
    o.descApplied === true ? ` · desc=applied${len}`
    : o.descApplied === false ? ` · desc=skipped(${o.descSkipReason}${len}${preview})`
    : ''
  if (!o.applied) {
    return `[TitleRewrite] skip(${o.skipReason}) postId=${postId} · ${o.detail}${desc}`
  }
  const hr = o.humanReview.length ? ` · 검수필요[${o.humanReview.join(',')}]` : ''
  return `[TitleRewrite] applied postId=${postId} · "${o.originalTitle}" → "${o.newTitle}" · style=${o.styleType} · conf=${o.confidence}${desc}${hr}`
}
