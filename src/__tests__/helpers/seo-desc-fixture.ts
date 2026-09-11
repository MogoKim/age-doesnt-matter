/**
 * SEO description 적용 도구 테스트용 가짜 CSV 행.
 *
 * `*.test.ts` 가 아니므로 vitest 가 테스트 파일로 잡지 않는다.
 * 행별 해시를 **실제로 계산해** 채운다 — 그래야 `HASH_MISMATCH` 검증을
 * 우회하지 않고 정상 경로를 그대로 탄다.
 */
import { sha256, type RewriteRow, type LiveRow } from '@/lib/seo/desc-apply-plan'

const COLS = [
  'id', 'boardType', 'source', 'rewriteDecision', 'applyEligible', 'targetField',
  'bannedTerms', 'termProvenance', 'provenanceDetail',
  'currentSeoTitle', 'proposedSeoTitle', 'currentSeoDescription', 'proposedSeoDescription',
  'currentSeoTitleSha256_12', 'currentSeoDescriptionSha256_12', 'liveValueVerifiedAt',
  'sourceTitleUnchanged', 'rewriteRationale', 'factCheckPassed', 'factAxesVerified',
  'properNounOverlapToken', 'residualBrandCopy', 'needsHumanReview', 'reviewReason',
]

/** 해시 열을 자동으로 맞춰주는 행 생성기. */
export function row(over: Partial<RewriteRow> & { id: string }): RewriteRow {
  const base: Record<string, string> = Object.fromEntries(COLS.map((c) => [c, '']))
  const merged = {
    ...base,
    boardType: 'JOB',
    source: 'SHEET',
    rewriteDecision: 'REWRITE_BRAND_COPY',
    applyEligible: 'true',
    currentSeoTitle: `제목 ${over.id}`,
    currentSeoDescription: `옛 문구 ${over.id}`,
    proposedSeoDescription: `새 문구 ${over.id}`,
    ...over,
  } as RewriteRow
  return {
    ...merged,
    currentSeoTitleSha256_12:
      over.currentSeoTitleSha256_12 ?? sha256(merged.currentSeoTitle).slice(0, 12),
    currentSeoDescriptionSha256_12:
      over.currentSeoDescriptionSha256_12 ?? sha256(merged.currentSeoDescription).slice(0, 12),
  }
}

/** 정상 59행 — 적용 50 + 보류 9 (분류 합계는 확정본과 동일) */
export function validRows(): RewriteRow[] {
  const rows: RewriteRow[] = []
  for (let i = 0; i < 50; i++) rows.push(row({ id: `ok${i}` }))
  for (let i = 0; i < 4; i++) {
    rows.push(row({ id: `hold${i}`, rewriteDecision: 'BRAND_COPY_HOLD_REVIEW', applyEligible: 'false', proposedSeoDescription: '' }))
  }
  rows.push(row({ id: 'partial0', rewriteDecision: 'BRAND_COPY_PARTIAL_HOLD_REVIEW', applyEligible: 'false' }))
  for (let i = 0; i < 3; i++) {
    rows.push(row({ id: `official${i}`, rewriteDecision: 'OFFICIAL_NAME_ONLY_REVIEW', applyEligible: 'false', proposedSeoDescription: '' }))
  }
  rows.push(row({ id: 'srctitle0', rewriteDecision: 'SOURCE_TITLE_ONLY_REVIEW', applyEligible: 'false', proposedSeoDescription: '' }))
  return rows
}

/** 적용 전 production 상태 — 전부 JOB/PUBLISHED */
export function liveFrom(rows: RewriteRow[]): LiveRow[] {
  return rows
    .filter((r) => r.applyEligible === 'true')
    .map((r) => ({
      id: r.id,
      boardType: 'JOB',
      status: 'PUBLISHED',
      seoTitle: r.currentSeoTitle === '' ? null : r.currentSeoTitle,
      seoDescription: r.currentSeoDescription === '' ? null : r.currentSeoDescription,
    }))
}
