/**
 * 격리 삭제 기한 초과 → Slack 알림.
 *
 * ── 왜 다시 만들었나 ────────────────────────────────────────
 * 이전 `quarantine-check.yml` 은 `secrets.SLACK_WEBHOOK_LOG` 를 썼는데
 * **그 secret 은 존재하지 않는다.** 게다가 `curl ... || echo "실패"` 라
 * 알림이 안 가도 workflow 는 success 로 끝났다. 초과 항목이 0건이라
 * 그 단계가 한 번도 실행되지 않았을 뿐, **경로는 처음부터 죽어 있었다.**
 *
 * 여기서는 이미 살아 있는 계약(`SLACK_BOT_TOKEN` + `SLACK_CHANNEL_LOG`,
 * `agents/core/notifier.ts` 와 동일)을 재사용하고, **실패를 실패로 알린다.**
 *
 * ── 계약 ───────────────────────────────────────────────────
 *   초과 0건        → Slack 호출 **없이** exit 0
 *   초과 있음 + 성공 → exit 0
 *   secret 없음      → exit 1
 *   HTTP 실패        → exit 1
 *   무응답(15초 초과) → exit 1
 *   HTTP 200 + ok:false → exit 1   (Slack 은 오류도 200 으로 준다)
 *
 * 🔇 로그에 secret 값도 메시지 원문도 찍지 않는다. 건수와 상태만 남긴다.
 *
 *   npx tsx agents/scripts/quarantine-slack-notify.ts
 *   npx tsx agents/scripts/quarantine-slack-notify.ts --dry-run   # 전송 없이 조립만
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage'
export const QUARANTINE_ROOT = '_quarantine'

/**
 * Slack 응답 제한시간.
 *
 * fetch 는 기본적으로 **무한정 기다린다.** Slack 이 연결만 잡고 응답을 주지
 * 않으면 job 은 실패도 성공도 아닌 채로 매달린다. 15초면 정상 응답에는
 * 충분하고, 초과는 네트워크 실패와 **똑같이** 실패로 본다.
 */
export const SLACK_TIMEOUT_MS = 15_000

export interface OverdueItem {
  /** 격리 폴더명 */
  folder: string
  /** YYYY-MM-DD */
  deadline: string
}

/** manifest 에서 삭제 예정일을 뽑는다. 없으면 null. */
export function parseDeadline(manifestText: string): string | null {
  for (const line of manifestText.split('\n')) {
    if (!line.includes('삭제 예정일')) continue
    const m = line.match(/\d{4}-\d{2}-\d{2}/)
    if (m) return m[0]
  }
  return null
}

/**
 * 기한 초과 판정.
 *
 * `YYYY-MM-DD` 는 사전식 비교가 곧 날짜 비교다. 기한 **당일도 초과**로 본다
 * (이전 셸 구현과 같은 기준 — `TODAY >= deadline`).
 */
export function isOverdue(today: string, deadline: string): boolean {
  return today >= deadline
}

export interface ScanDeps {
  listFolders(root: string): string[]
  readManifest(root: string, folder: string): string | null
}

/** 실제 파일시스템을 읽는 기본 구현. */
export const fsDeps: ScanDeps = {
  listFolders(root) {
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  },
  readManifest(root, folder) {
    const p = join(root, folder, 'quarantine_manifest.md')
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  },
}

export function scanOverdue(today: string, root = QUARANTINE_ROOT, deps: ScanDeps = fsDeps): OverdueItem[] {
  const out: OverdueItem[] = []
  for (const folder of deps.listFolders(root)) {
    const text = deps.readManifest(root, folder)
    if (text === null) continue
    const deadline = parseDeadline(text)
    if (deadline && isOverdue(today, deadline)) out.push({ folder, deadline })
  }
  return out
}

export interface SlackConfig { token: string; channel: string }

/**
 * 필수 secret 확인.
 *
 * 값을 찍지 않는다 — **어떤 이름이 비었는지만** 알린다.
 * 공백만 있는 값도 없는 것으로 본다(비어 있는 secret 을 설정한 흔한 실수).
 */
export function resolveSlackConfig(env: Record<string, string | undefined>): SlackConfig {
  const token = (env.SLACK_BOT_TOKEN ?? '').trim()
  const channel = (env.SLACK_CHANNEL_LOG ?? '').trim()
  const missing: string[] = []
  if (!token) missing.push('SLACK_BOT_TOKEN')
  if (!channel) missing.push('SLACK_CHANNEL_LOG')
  if (missing.length) {
    throw new Error(`Slack secret 누락: ${missing.join(', ')} — 알림을 보낼 수 없다`)
  }
  return { token, channel }
}

/**
 * Slack 메시지 조립.
 *
 * 폴더명은 사람이 만든 디렉터리 이름이라 따옴표·역슬래시·개행이 들어갈 수 있다.
 * 이전 구현은 문자열 보간으로 JSON 을 **손으로 만들어서** 그런 글자 하나에
 * 페이로드 전체가 깨졌다. 여기서는 객체를 만들고 `JSON.stringify` 에 맡긴다.
 */
export function buildMessage(channel: string, items: OverdueItem[]): { channel: string; text: string } {
  const lines = items.map((i) => `• ${i.folder} (기한: ${i.deadline})`).join('\n')
  const text =
    `🗑️ *[격리 삭제 기한 초과]* ${items.length}개 항목\n` +
    '```\n' + lines + '\n```\n' +
    '→ `bash scripts/clean_quarantine.sh` 실행 후 git commit 하세요.'
  return { channel, text }
}

export type FetchLike = (url: string, init: {
  method: string
  headers: Record<string, string>
  body: string
  signal: AbortSignal
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

/**
 * Slack `chat.postMessage`.
 *
 * 🔴 Slack 은 **오류도 HTTP 200 으로 준다.** 그래서 상태 코드만 보면 안 되고
 * 본문의 `ok` 를 반드시 확인해야 한다. 실패하면 throw 한다 — 삼키지 않는다.
 *
 * 무응답도 실패다. `AbortSignal` 로 제한시간을 걸고, 초과는 네트워크 오류와
 * 같은 취급을 한다. 오류 문구에 token·channel·메시지 원문은 담지 않는다.
 */
export async function postToSlack(
  fetchImpl: FetchLike,
  cfg: SlackConfig,
  message: { channel: string; text: string },
  timeoutMs: number = SLACK_TIMEOUT_MS,
): Promise<void> {
  // 타이머는 **본문을 다 읽을 때까지** 살려둔다. 헤더만 주고 body 를
  // 찔끔거리는 응답도 매달림이기는 마찬가지다.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const timeoutError = () => new Error(`Slack 요청 제한시간 초과 (${timeoutMs}ms)`)

  try {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchImpl(SLACK_POST_MESSAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      })
    } catch (e) {
      if (timedOut) throw timeoutError()
      throw new Error(`Slack 요청 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok) throw new Error(`Slack HTTP ${res.status}`)

    let raw: string
    try {
      raw = await res.text()
    } catch (e) {
      if (timedOut) throw timeoutError()
      throw new Error(`Slack 응답 본문을 읽지 못했다: ${e instanceof Error ? e.message : String(e)}`)
    }

    let body: { ok?: boolean; error?: string }
    try {
      body = JSON.parse(raw) as { ok?: boolean; error?: string }
    } catch {
      // 응답 본문을 그대로 찍지 않는다 — 토큰이 섞여 돌아올 이유는 없지만 습관을 지킨다
      throw new Error('Slack 응답을 JSON 으로 읽을 수 없다')
    }
    if (body.ok !== true) throw new Error(`Slack ok:false (error=${body.error ?? 'unknown'})`)
  } finally {
    // 성공했든 실패했든 타이머를 남기지 않는다 — 남으면 프로세스가 안 끝난다.
    clearTimeout(timer)
  }
}

export interface RunDeps {
  today: string
  env: Record<string, string | undefined>
  fetchImpl: FetchLike
  scan: ScanDeps
  root: string
  dryRun: boolean
  /** 생략하면 SLACK_TIMEOUT_MS. 테스트에서만 줄인다. */
  timeoutMs?: number
  log(line: string): void
}

/** 종료 코드를 돌려준다 — 0 성공, 1 실패. */
export async function run(deps: RunDeps): Promise<number> {
  const items = scanOverdue(deps.today, deps.root, deps.scan)
  deps.log(`격리 기한 초과: ${items.length}건 (기준일 ${deps.today})`)

  if (items.length === 0) {
    deps.log('✅ 초과 항목 없음 — Slack 호출 없이 종료')
    return 0
  }

  let cfg: SlackConfig
  try {
    cfg = resolveSlackConfig(deps.env)
  } catch (e) {
    deps.log(`❌ ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }

  const message = buildMessage(cfg.channel, items)
  if (deps.dryRun) {
    // 메시지 원문을 찍지 않는다. 조립이 됐다는 사실과 크기만 알린다.
    deps.log(`[dry-run] 전송하지 않음 · 항목 ${items.length}건 · payload ${JSON.stringify(message).length}바이트`)
    return 0
  }

  try {
    await postToSlack(deps.fetchImpl, cfg, message, deps.timeoutMs ?? SLACK_TIMEOUT_MS)
  } catch (e) {
    deps.log(`❌ Slack 알림 실패: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
  deps.log(`✅ Slack 알림 전송 완료 (${items.length}건)`)
  return 0
}

/** import 만으로는 아무것도 하지 않는다. */
export const isDirectRun = (): boolean =>
  Boolean(process.argv[1]?.includes('quarantine-slack-notify'))

if (isDirectRun()) {
  run({
    today: new Date().toISOString().slice(0, 10),
    env: process.env,
    fetchImpl: globalThis.fetch as unknown as FetchLike,
    scan: fsDeps,
    root: QUARANTINE_ROOT,
    dryRun: process.argv.includes('--dry-run'),
    log: (l) => console.log(l),
  })
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error('❌ 예기치 못한 오류:', e instanceof Error ? e.message : String(e))
      process.exit(1)
    })
}
