// 거울 보드 1단계 카드 정의 (5개).
// 각 카드는 probe 파라미터(sha/workflow/url)와 decide()만 가진다.
// probe 실행은 evaluator가 담당한다(단일 진입점). DB probe 없음.
import type { CardProbeResults, Column } from '../probes/probe.types.js'

export type Category = '완료됨' | '배포완료-적용확인' | '지금가능' | '백로그' | '제외'

export interface Card {
  id: string
  title: string
  track: 'T1-검증' | 'T2-성능' | 'T3-봇'
  /** probe가 전부 판정불가일 때의 기본 분류 */
  baseCategory: Category
  probes: { git?: string; ci?: string; http?: string[]; db?: { label: string; sql: string } }
  /** probe 가정이 마지막으로 사람에 의해 검증된 날(YYYY-MM-DD). 90일 초과 시 메타-stale 경고 */
  probeReviewedAt: string
  note?: string
  decide(r: CardProbeResults): { column: Column; label: string }
}

const SITE = 'https://age-doesnt-matter.com'
const REVIEWED = '2026-06-04'

/** git 커밋 + CI 공통 판정. DB proof가 없으면 최대 REVIEW까지만(절대 DONE 아님). */
function decideGitCi(r: CardProbeResults, reviewLabel: string): { column: Column; label: string } {
  const g = r.git
  const c = r.ci
  if (!g || g.ok === null) return { column: 'PENDING', label: '⚠️ git 판정불가' }
  if (g.ok === false) return { column: 'PENDING', label: '커밋 미반영' }
  // git 커밋 존재(true)
  if (!c) return { column: 'REVIEW', label: reviewLabel }
  if (c.ok === false) return { column: 'DOING', label: 'CI 실패 — 확인 필요' }
  if (c.ok === null) return { column: 'REVIEW', label: `${reviewLabel} (CI 판정불가)` }
  return { column: 'REVIEW', label: reviewLabel }
}

export const CARDS: Card[] = [
  {
    id: 'C-MAGJOB-BLOCK',
    title: 'MAGAZINE/JOB 봇 engagement 차단',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: {
      git: 'e01ed14',
      ci: 'CI (Smart QA)',
      db: {
        label: 'magazine/job bot engagement after block',
        sql: `SELECT (
          SELECT count(*)::int
          FROM "Comment" c
          JOIN "Post" p ON p.id = c."postId"
          JOIN "User" u ON u.id = c."authorId"
          WHERE p."boardType" IN ('MAGAZINE','JOB')
            AND c."createdAt" > '2026-06-04T08:25:00Z'
            AND (u.email LIKE '%@unao.bot%' OR u.email LIKE '%bot%')
        ) + (
          SELECT count(*)::int
          FROM "Like" l
          JOIN "Post" p ON p.id = l."postId"
          JOIN "User" u ON u.id = l."userId"
          WHERE p."boardType" IN ('MAGAZINE','JOB')
            AND l."createdAt" > '2026-06-04T08:25:00Z'
            AND (u.email LIKE '%@unao.bot%' OR u.email LIKE '%bot%')
        ) AS n`,
      },
    },
    probeReviewedAt: REVIEWED,
    note: '차단 후 MAG/JOB BOT 댓글·좋아요 0건이면 DONE. 사람 댓글은 정책상 허용.',
    decide: (r) => {
      const db = r.db
      if (!db || db.ok === null) return decideGitCi(r, 'DB 검증 대기 — MAG/JOB BOT 0건 확인 필요')
      const n = Number(db.detail.count ?? 0)
      if (n === 0) return { column: 'DONE', label: '신규 MAG/JOB 봇 engagement 0건 — 차단 확인' }
      return { column: 'DOING', label: `신규 MAG/JOB 봇 engagement ${n}건 — 즉시 확인 필요` }
    },
  },
  {
    id: 'C-SHEET-V15',
    title: 'SHEET v1.5 댓글 품질(source-only fact 차단)',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: { git: 'd1861dd', ci: 'CI (Smart QA)' },
    probeReviewedAt: REVIEWED,
    note: 'DB proof(2단계): 신규 SHEET 댓글 source-only fact 0건',
    decide: (r) => decideGitCi(r, '신규 SHEET 글 댓글 검증 대기'),
  },
  {
    id: 'C-EVENTLOG-V1',
    title: '고객 참여 이벤트 측정 v1',
    track: 'T1-검증',
    baseCategory: '배포완료-적용확인',
    probes: {
      git: 'edc3f36',
      ci: 'CI (Smart QA)',
      db: {
        label: 'post_cta_clicked/scrap/share/comment_create',
        sql: `SELECT count(*)::int AS n FROM "EventLog" WHERE "eventName" IN ('post_cta_clicked','scrap','share','comment_create') AND "createdAt" > '2026-06-04T08:00:00Z'`,
      },
    },
    probeReviewedAt: REVIEWED,
    note: 'edc3f36 배포(06-04 08:06 UTC) 이후 post_cta_clicked/scrap/share/comment_create 실제 수집 여부',
    decide: (r) => {
      const db = r.db
      // DB 미설정/판정불가 → git+ci 기준(REVIEW)
      if (!db || db.ok === null) return decideGitCi(r, 'EventLog 데이터 축적 대기 (DB 미연결)')
      const n = Number(db.detail.count ?? 0)
      if (n === 0) return { column: 'REVIEW', label: '⚠️ 측정 이벤트 0건 — 배포됐으나 미수집(점검 필요)' }
      return { column: 'DONE', label: `측정 작동 확인 — CTA/scrap/share/comment ${n}건 수집` }
    },
  },
  {
    id: 'C-AGENT-DB-SATURATION',
    title: 'Agent DB 포화 재발 방지(운영 관찰)',
    track: 'T3-봇',
    baseCategory: '배포완료-적용확인',
    probes: { ci: 'Agents — Cafe Comment Wave' },
    probeReviewedAt: REVIEWED,
    note: '대표 워크플로우: Cafe Comment Wave(5분 간격). 실패 시 DB 포화/연결 재점검',
    decide: (r) => {
      const c = r.ci
      if (!c || c.ok === null) return { column: 'PENDING', label: '⚠️ CI 판정불가' }
      if (c.ok === false) return { column: 'DOING', label: 'agents 워크플로우 실패 — 확인 필요' }
      const ok = String(c.detail.successCount ?? '?')
      const n = String(c.detail.sampleSize ?? '?')
      return { column: 'REVIEW', label: `운영 정상 관찰중 (${ok}/${n} success)` }
    },
  },
  {
    id: 'C-SPEED-CACHE',
    title: '속도/캐시 상태(주요 페이지)',
    track: 'T2-성능',
    baseCategory: '지금가능',
    probes: { http: ['/', '/best', '/community/stories', '/magazine', '/jobs', '/login'].map((p) => SITE + p) },
    probeReviewedAt: REVIEWED,
    note: 'x-vercel-cache HIT/MISS + 상태코드 실측',
    decide: (r) => {
      const hs = r.http ?? []
      if (hs.length === 0) return { column: 'PENDING', label: 'http probe 없음' }
      const nullCount = hs.filter((h) => h.ok === null).length
      const failCount = hs.filter((h) => h.ok === false).length
      const edgeCacheCount = hs.filter((h) => h.detail.cache === 'HIT' || h.detail.cache === 'STALE').length
      if (nullCount === hs.length) return { column: 'PENDING', label: '⚠️ 전부 판정불가' }
      if (failCount > 0) return { column: 'DOING', label: `${failCount}개 페이지 비정상(4xx/5xx)` }
      return { column: 'REVIEW', label: `${hs.length}개 정상 · CDN 캐시(HIT/STALE) ${edgeCacheCount}개` }
    },
  },
]
