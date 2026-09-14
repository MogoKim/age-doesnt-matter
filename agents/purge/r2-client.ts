/**
 * R2 객체 삭제 — HEAD → DELETE → HEAD 검증.
 *
 * 서명은 `agents/scripts/purge-naver-cafe-data.ts` 와 같은 AWS SigV4 방식이다.
 *
 * ── 원칙 ─────────────────────────────────────────────────────
 *  · 지웠다고 **추정하지 않는다.** DELETE 뒤 HEAD 로 실제로 사라졌는지 본다.
 *    S3 계열은 없는 키에도 204 를 주기 때문에 응답 코드만으로는 판정이 안 된다.
 *  · `403`·`429`·`5xx` 는 "없다"가 아니다. `UNCERTAIN` 으로 두고 **그 객체만 건너뛴다.**
 *  · 이미지 실패는 글 삭제를 되돌리는 사유가 아니다(창업자 지시).
 *  · 로그에 원본 키를 쓰지 않는다 — 지문만 남긴다.
 */
import { createHash, createHmac } from 'node:crypto'
import { classifyHead, classifyDelete, type ObjectOutcome } from './r2-objects.js'

export interface R2Config {
  accountId: string
  accessKey: string
  secretKey: string
  bucket: string
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) =>
  Promise<{ status: number }>

const sha256hex = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex')
const hmac = (key: Buffer | string, v: string) => createHmac('sha256', key).update(v, 'utf8').digest()

/** AWS SigV4 (s3, auto 리전). R2 는 리전이 `auto` 다. */
export function signHeaders(cfg: R2Config, method: string, key: string, now = new Date()): Record<string, string> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const canonicalUri = '/' + `${cfg.bucket}/${key}`.split('/').map(encodeURIComponent).join('/')
  const payloadHash = sha256hex('')
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${cfg.secretKey}`, dateStamp)
  const signing = hmac(hmac(hmac(kDate, 'auto'), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signing).update(toSign, 'utf8').digest('hex')
  return {
    Host: host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

export const objectUrl = (cfg: R2Config, key: string): string =>
  `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`

const TIMEOUT_MS = 15_000

async function call(fetchImpl: FetchLike, cfg: R2Config, method: string, key: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(objectUrl(cfg, key), {
      method,
      headers: signHeaders(cfg, method, key),
      signal: controller.signal,
    })
    return res.status
  } catch {
    // 네트워크 실패·제한시간 초과는 "없다"는 뜻이 아니다.
    return 0
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 객체 하나를 지운다.
 *
 * 흐름: HEAD → (있으면) DELETE → HEAD 재확인.
 * 마지막 HEAD 가 404 여야만 `DELETED` 라고 말한다.
 */
export async function deleteObject(fetchImpl: FetchLike, cfg: R2Config, key: string): Promise<ObjectOutcome> {
  const before = classifyHead(await call(fetchImpl, cfg, 'HEAD', key))
  if (before === 'ABSENT') return 'ALREADY_GONE'
  if (before === 'UNCERTAIN') return 'SKIPPED_UNCERTAIN'

  if (classifyDelete(await call(fetchImpl, cfg, 'DELETE', key)) === 'UNCERTAIN') return 'SKIPPED_UNCERTAIN'

  // 지웠다고 믿지 않는다 — 다시 본다.
  const after = classifyHead(await call(fetchImpl, cfg, 'HEAD', key))
  if (after === 'ABSENT') return 'DELETED'
  return 'SKIPPED_UNCERTAIN'
}

export interface R2RunSummary {
  deleted: number
  alreadyGone: number
  sharedSkipped: number
  uncertain: number
  /** 아직 남아 있는(=다음 실행에서 이어서 처리할) 키 수 */
  remaining: number
}

/**
 * manifest 를 순회한다.
 *
 * `sharedKeys` 는 **절대 건드리지 않는다.** DB 가 이미 끝난 상태에서도 호출할 수 있어야
 * 하므로 이 함수는 DB 상태를 전혀 보지 않는다 — 그래서 재개가 가능하다.
 */
export async function runR2Cleanup(
  fetchImpl: FetchLike,
  cfg: R2Config,
  keys: readonly string[],
  sharedKeys: ReadonlySet<string>,
): Promise<R2RunSummary> {
  let deleted = 0, alreadyGone = 0, sharedSkipped = 0, uncertain = 0
  for (const key of keys) {
    if (sharedKeys.has(key)) { sharedSkipped++; continue }
    const outcome = await deleteObject(fetchImpl, cfg, key)
    if (outcome === 'DELETED') deleted++
    else if (outcome === 'ALREADY_GONE') alreadyGone++
    else uncertain++
  }
  return { deleted, alreadyGone, sharedSkipped, uncertain, remaining: uncertain }
}
