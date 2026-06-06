import type { Metadata } from 'next'
import Link from 'next/link'
import { getBotLogsDetail, getBotLogStats } from '@/lib/queries/admin'
import type { BotStatus, BotType } from '@/generated/prisma/client'
import BotLogDetail from '@/components/admin/BotLogDetail'
import { prisma } from '@/lib/prisma'
import { HANDLER_REGISTRY, HANDLER_GROUPS, type HandlerMeta } from '@/lib/agent-registry'

export const metadata: Metadata = { title: '에이전트 로그' }
export const dynamic = 'force-dynamic'

const BOT_TYPE_OPTIONS: { value: BotType | ''; label: string }[] = [
  { value: '', label: '전체 에이전트' },
  { value: 'CEO', label: '👑 CEO' },
  { value: 'CTO', label: '🔧 CTO' },
  { value: 'CMO', label: '📣 CMO' },
  { value: 'CPO', label: '📦 CPO' },
  { value: 'CDO', label: '📊 CDO' },
  { value: 'CFO', label: '💰 CFO' },
  { value: 'COO', label: '⚙️ COO' },
  { value: 'SEED', label: '🌱 SEED' },
  { value: 'CAFE_CRAWLER', label: '☕ 카페 크롤러' },
  { value: 'JOB', label: '💼 일자리' },
  { value: 'HUMOR', label: '😄 유머' },
  { value: 'STORY', label: '💬 이야기' },
  { value: 'THREAD', label: '🤖 스레드' },
]

const STATUS_OPTIONS: { value: BotStatus | ''; label: string }[] = [
  { value: '', label: '전체 상태' },
  { value: 'SUCCESS', label: '✅ 성공' },
  { value: 'PARTIAL', label: '⚠️ 부분 성공' },
  { value: 'FAILED', label: '❌ 실패' },
]

const BOT_TYPE_LABELS: Record<string, string> = {
  CEO: '👑 CEO', CTO: '🔧 CTO', CMO: '📣 CMO', CPO: '📦 CPO',
  CDO: '📊 CDO', CFO: '💰 CFO', COO: '⚙️ COO', SEED: '🌱 SEED',
  CAFE_CRAWLER: '☕ 카페 크롤러', JOB: '💼 일자리', HUMOR: '😄 유머',
  STORY: '💬 이야기', THREAD: '🤖 스레드',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  SUCCESS: { label: '✅ 성공', className: 'bg-green-50 text-green-700' },
  PARTIAL: { label: '⚠️ 부분', className: 'bg-yellow-50 text-yellow-700' },
  FAILED: { label: '❌ 실패', className: 'bg-red-50 text-red-700' },
}

// ─── 핸들러 현황 뷰용 타입/유틸 ─────────────────────────────────────────────

type DisplayStatus = 'active' | 'warning' | 'failed' | 'dispatch' | 'local' | 'unknown'

interface HandlerWithStatus extends HandlerMeta {
  lastStatus: string | null
  lastRun: Date | null
  itemCount: number
  displayStatus: DisplayStatus
}

function toDisplayStatus(
  type: HandlerMeta['type'],
  lastStatus: string | null,
  lastRun: Date | null,
): DisplayStatus {
  if (type === 'DISPATCH') return 'dispatch'
  if (type === 'LOCAL') return 'local'
  if (!lastRun) return 'unknown'
  const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60)
  if (lastStatus === 'SUCCESS') return hoursSince <= 26 ? 'active' : 'unknown'
  if (lastStatus === 'FAILED') return 'failed'
  if (lastStatus === 'PARTIAL') return 'warning'
  return 'unknown'
}

const DISPLAY_STATUS_BADGE: Record<DisplayStatus, { dot: string; bg: string; text: string; label: string }> = {
  active:   { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  label: '✅ 정상' },
  warning:  { dot: 'bg-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', label: '⚠️ 부분' },
  failed:   { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    label: '🔴 실패' },
  dispatch: { dot: 'bg-zinc-400',   bg: 'bg-zinc-100',  text: 'text-zinc-500',   label: '⛔ 수동' },
  local:    { dot: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-600',   label: '🏠 로컬' },
  unknown:  { dot: 'bg-zinc-300',   bg: 'bg-zinc-50',   text: 'text-zinc-400',   label: '❓ 미실행' },
}

async function getHandlerStatuses(): Promise<HandlerWithStatus[]> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const recentLogs = await prisma.botLog.findMany({
    where: { executedAt: { gte: fortyEightHoursAgo } },
    select: { botType: true, action: true, status: true, executedAt: true, itemCount: true },
    orderBy: { executedAt: 'desc' },
    take: 3000,
  })

  const logMap = new Map<string, { status: string; executedAt: Date; itemCount: number }>()
  for (const log of recentLogs) {
    const key = `${log.botType}:${log.action ?? '__none__'}`
    if (!logMap.has(key)) {
      logMap.set(key, { status: log.status, executedAt: log.executedAt, itemCount: log.itemCount })
    }
  }

  return HANDLER_REGISTRY.map((h) => {
    const logKey = `${h.botType}:${h.action ?? '__none__'}`
    const log = logMap.get(logKey)
    return {
      ...h,
      lastStatus: log?.status ?? null,
      lastRun: log?.executedAt ?? null,
      itemCount: log?.itemCount ?? 0,
      displayStatus: toDisplayStatus(h.type, log?.status ?? null, log?.executedAt ?? null),
    }
  })
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return '—'
  const diff = Date.now() - date.getTime()
  const h = Math.floor(diff / (1000 * 60 * 60))
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (h >= 24) return `${Math.floor(h / 24)}일 전`
  if (h > 0) return `${h}시간 ${m}분 전`
  return `${m}분 전`
}

// ─── 인터페이스 ─────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{
    type?: string
    status?: string
    days?: string
    cursor?: string
    view?: string
  }>
}

export default async function AgentsPage({ searchParams }: Props) {
  const params = await searchParams
  const view = params.view === 'status' ? 'status' : 'logs'

  const tabLink = (v: string) => {
    const p = new URLSearchParams()
    p.set('view', v)
    return `/admin/agents?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* 탭 */}
      <div className="flex gap-2 border-b border-zinc-200 pb-0">
        <Link
          href={tabLink('logs')}
          className={`px-4 py-2 text-sm font-medium no-underline border-b-2 -mb-px transition-colors ${
            view === 'logs'
              ? 'border-[#FF6F61] text-[#FF6F61]'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          로그 상세
        </Link>
        <Link
          href={tabLink('status')}
          className={`px-4 py-2 text-sm font-medium no-underline border-b-2 -mb-px transition-colors ${
            view === 'status'
              ? 'border-[#FF6F61] text-[#FF6F61]'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          핸들러 현황
        </Link>
      </div>

      {view === 'status' ? (
        <HandlerStatusView />
      ) : (
        <LogDetailView params={params} />
      )}
    </div>
  )
}

// ─── 핸들러 현황 뷰 ─────────────────────────────────────────────────────────

async function HandlerStatusView() {
  const handlers = await getHandlerStatuses()
  const byKey = new Map(handlers.map((h) => [h.key, h]))

  const counts = handlers.reduce(
    (acc, h) => {
      if (h.displayStatus === 'active') acc.active++
      else if (h.displayStatus === 'failed') acc.failed++
      else if (h.displayStatus === 'warning') acc.warning++
      else if (h.displayStatus === 'dispatch' || h.displayStatus === 'local') acc.skip++
      else acc.unknown++
      return acc
    },
    { active: 0, failed: 0, warning: 0, skip: 0, unknown: 0 },
  )

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label="정상" value={counts.active} color="text-green-700" />
        <SummaryCard label="실패" value={counts.failed} color="text-red-700" />
        <SummaryCard label="부분" value={counts.warning} color="text-yellow-700" />
        <SummaryCard label="미실행" value={counts.unknown} color="text-zinc-400" />
        <SummaryCard label="수동/로컬" value={counts.skip} color="text-zinc-400" />
      </div>

      {/* 팀별 그룹 */}
      <div className="space-y-4">
        {HANDLER_GROUPS.map((group) => {
          const groupHandlers = group.keys
            .map((k) => byKey.get(k))
            .filter((h): h is HandlerWithStatus => h !== undefined)

          return (
            <div key={group.team} className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                <span className="text-sm font-semibold text-zinc-700">
                  {group.emoji} {group.team}
                </span>
                <span className="ml-2 text-xs text-zinc-400">{groupHandlers.length}개</span>
              </div>
              <div className="divide-y divide-zinc-100">
                {groupHandlers.map((h) => {
                  const badge = DISPLAY_STATUS_BADGE[h.displayStatus]
                  return (
                    <div key={h.key} className="flex items-center gap-3 px-4 py-2.5">
                      {/* 상태 점 */}
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${badge.dot}`} />

                      {/* 레이블 + 키 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-800 truncate">{h.label}</div>
                        <div className="text-xs text-zinc-400 font-mono truncate">{h.key}</div>
                      </div>

                      {/* 스케줄 */}
                      <div className="hidden sm:block text-xs text-zinc-400 flex-shrink-0 w-32 text-right truncate">
                        {h.schedule}
                      </div>

                      {/* 마지막 실행 */}
                      <div className="text-xs text-zinc-400 flex-shrink-0 w-20 text-right">
                        {formatRelativeTime(h.lastRun)}
                      </div>

                      {/* 상태 배지 */}
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>

                      {/* 특이사항 */}
                      {h.note && (
                        <span className="hidden lg:block text-xs text-zinc-400 truncate max-w-[160px]">
                          {h.note}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-zinc-400 text-center">최근 48시간 BotLog 기준 · 매 페이지 로드마다 갱신</p>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

// ─── 로그 상세 뷰 (기존 로직) ───────────────────────────────────────────────

async function LogDetailView({
  params,
}: {
  params: { type?: string; status?: string; days?: string; cursor?: string }
}) {
  const days = parseInt(params.days ?? '1', 10)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [{ logs, hasMore }, stats] = await Promise.all([
    getBotLogsDetail({
      botType: params.type ? (params.type as BotType) : undefined,
      status: params.status ? (params.status as BotStatus) : undefined,
      since,
      cursor: params.cursor,
    }),
    getBotLogStats(),
  ])

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams({
      view: 'logs',
      ...(params.type && { type: params.type }),
      ...(params.status && { status: params.status }),
      ...(params.days && params.days !== '1' && { days: params.days }),
      ...overrides,
    })
    return `/admin/agents?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="오늘 실행" value={stats.todayCount} />
        <StatCard label="성공" value={stats.successCount} className="text-green-700" />
        <StatCard label="실패" value={stats.failedCount} className="text-red-700" />
        <StatCard label="평균 소요" value={`${(stats.avgExecutionMs / 1000).toFixed(1)}s`} />
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1">
          {BOT_TYPE_OPTIONS.slice(0, 5).map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ type: opt.value || undefined, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.type ?? '') === opt.value
                  ? 'bg-[#FF6F61] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
          {BOT_TYPE_OPTIONS.slice(5).map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ type: opt.value || undefined, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.type ?? '') === opt.value
                  ? 'bg-[#FF6F61] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ status: opt.value || undefined, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.status ?? '') === opt.value
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        <div className="flex gap-1">
          {[
            { value: '1', label: '오늘' },
            { value: '3', label: '3일' },
            { value: '7', label: '7일' },
          ].map((opt) => (
            <Link
              key={opt.value}
              href={buildUrl({ days: opt.value, cursor: undefined })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                (params.days ?? '1') === opt.value
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 로그 테이블 */}
      {logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-zinc-400">로그가 없습니다.</div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {logs.map((log) => {
              const badge = STATUS_BADGE[log.status] ?? STATUS_BADGE.SUCCESS
              const execSec = (log.executionTimeMs / 1000).toFixed(1)
              return (
                <BotLogDetail
                  key={log.id}
                  log={{
                    id: log.id,
                    botType: log.botType,
                    status: log.status,
                    action: log.action,
                    itemCount: log.itemCount,
                    executionTimeMs: log.executionTimeMs,
                    details: log.details,
                    executedAt: log.executedAt,
                  }}
                  typeLabel={BOT_TYPE_LABELS[log.botType] ?? log.botType}
                  badge={badge}
                  execSec={execSec}
                />
              )
            })}
          </div>
        </div>
      )}

      {hasMore && logs.length > 0 && (
        <div className="flex justify-center">
          <Link
            href={buildUrl({ cursor: logs[logs.length - 1].executedAt.toISOString() })}
            className="rounded-lg border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-600 no-underline transition-colors hover:bg-zinc-50"
          >
            더 보기
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, className = 'text-zinc-900' }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${className}`}>{value}</div>
    </div>
  )
}
