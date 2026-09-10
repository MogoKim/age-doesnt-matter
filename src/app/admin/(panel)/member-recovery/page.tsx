import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAdminSession } from '@/lib/admin-auth'
import {
  getMemberRecovery,
  parseWindowDays,
  MEMBER_RECOVERY_WINDOWS,
  type Conversion,
  type FunnelStep,
  type MemberRecoveryData,
} from '@/lib/queries/admin/admin.member-recovery'

export const metadata: Metadata = { title: '회원 소생 측정' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ window?: string }>
}

const num = (n: number) => n.toLocaleString('ko-KR')

/** 비율 표시 — `null` 은 0% 가 아니라 '판정 불가'다. 절대 0으로 그리지 않는다. */
function Rate({ rate, status }: { rate: number | null; status: string }) {
  if (rate == null) {
    return (
      <span className="text-zinc-400" title="분모가 0이라 비율을 만들 수 없다">
        판정 불가
      </span>
    )
  }
  return (
    <span className="font-semibold tabular-nums">
      {rate}%{status === 'PARTIAL' && <span className="ml-1 text-amber-600" title="하한값">≥</span>}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    COLLECTED: { text: '수집됨', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    PARTIAL: { text: '부분 수집', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    NOT_COLLECTED: { text: '미수집', cls: 'bg-red-50 text-red-700 border-red-200' },
    OK: { text: '정상', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    NO_DENOM: { text: '분모 0', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    WARN: { text: '주의', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    GAP: { text: '결손', cls: 'bg-red-50 text-red-700 border-red-200' },
  }
  const v = map[status] ?? { text: status, cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-4 ${v.cls}`}>{v.text}</span>
}

function Section({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-bold text-zinc-900">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{lead}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function FunnelTable({ steps, conversions }: { steps: FunnelStep[]; conversions: Conversion[] }) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-2 pr-3">단계</th>
              <th className="py-2 pr-3 text-right">세션</th>
              <th className="py-2 pr-3">수집</th>
              <th className="py-2">측정 방식</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.key} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-3 font-medium text-zinc-900">{s.label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {s.sessions == null ? <span className="text-zinc-400">미수집</span> : num(s.sessions)}
                </td>
                <td className="py-2 pr-3"><StatusChip status={s.status} /></td>
                <td className="py-2 text-xs leading-5 text-zinc-500">{s.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-2 pr-3">전환</th>
              <th className="py-2 pr-3 text-right">분자 / 분모</th>
              <th className="py-2 pr-3 text-right">전환율</th>
              <th className="py-2">읽는 법</th>
            </tr>
          </thead>
          <tbody>
            {conversions.map((c) => (
              <tr key={c.key} className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-3 font-medium text-zinc-900">{c.label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {num(c.numer)} / {num(c.denom)}
                  <div className="text-[11px] font-normal text-zinc-400">
                    {c.numerLabel} / {c.denomLabel}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right"><Rate rate={c.rate} status={c.status} /></td>
                <td className="py-2 text-xs leading-5 text-zinc-500">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function MemberRecoveryPage({ searchParams }: Props) {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const params = await searchParams
  const windowDays = parseWindowDays(params.window)
  const data: MemberRecoveryData = await getMemberRecovery(windowDays)
  const { activation, replyLoop, retention } = data

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">R8 회원 소생 측정</h1>
            <p className="mt-1 text-xs text-zinc-500">
              실회원이 <strong>어느 단계에서 끊기는지</strong> 본다. 실회원 = <code>providerId</code> 순수 숫자 AND{' '}
              <code>role ≠ ADMIN</code> · 이벤트 <code>isBot=false</code> · 내부(창업자·어드민) 세션 제외.
            </p>
          </div>
          <nav className="flex gap-1" aria-label="관측 기간">
            {MEMBER_RECOVERY_WINDOWS.map((w) => (
              <Link
                key={w}
                href={`/admin/member-recovery?window=${w}`}
                prefetch={false}
                className={`rounded border px-3 py-1.5 text-sm no-underline ${
                  w === windowDays
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                최근 {w}일
              </Link>
            ))}
          </nav>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded border border-zinc-100 bg-zinc-50 p-3">
            <dt className="text-xs text-zinc-500">실회원 계정</dt>
            <dd className="text-lg font-bold tabular-nums text-zinc-900">{num(data.realMemberTotal)}</dd>
          </div>
          <div className="rounded border border-zinc-100 bg-zinc-50 p-3">
            <dt className="text-xs text-zinc-500">{windowDays}일 신규 가입</dt>
            <dd className="text-lg font-bold tabular-nums text-zinc-900">{num(data.newMembers)}</dd>
          </div>
          <div className="rounded border border-zinc-100 bg-zinc-50 p-3">
            <dt className="text-xs text-zinc-500">집계 시각</dt>
            <dd className="text-sm tabular-nums text-zinc-700">
              {new Date(data.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
            </dd>
          </div>
        </dl>
      </header>

      <Section
        title="1단계 · 방문 → 가입 유도 노출 → 카카오 로그인 시작 → 가입 완료"
        lead={`세션 기준. 분모·분자를 함께 적는다. ≥ 표시는 이벤트 유실 가능성이 있어 실제 값이 그 이상이라는 뜻이다.`}
      >
        <FunnelTable steps={data.signupFunnel.steps} conversions={data.signupFunnel.conversions} />
      </Section>

      <Section
        title="2단계 · 가입 → 첫 글 또는 첫 댓글"
        lead="가입일 코호트 기준. 가입 후 24시간이 안 지난 사람은 '안 썼다'가 아니라 '판정할 시간이 없었다'라서 분모에서 뺀다."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">코호트({windowDays}일 신규 가입 실회원)</td>
                <td className="py-2 text-right tabular-nums">{num(activation.cohortTotal)}명</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">
                  성숙 전 제외 <span className="text-xs text-zinc-400">(가입 24시간 미경과)</span>
                </td>
                <td className="py-2 text-right tabular-nums text-amber-700">−{num(activation.immature)}명</td>
              </tr>
              <tr className="border-b border-zinc-200 font-medium">
                <td className="py-2 pr-3 text-zinc-900">분모 (성숙 코호트)</td>
                <td className="py-2 text-right tabular-nums">{num(activation.matureDenom)}명</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">첫 글을 쓴 사람</td>
                <td className="py-2 text-right tabular-nums">{num(activation.wrotePost)}명</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">첫 댓글을 쓴 사람</td>
                <td className="py-2 text-right tabular-nums">{num(activation.wroteComment)}명</td>
              </tr>
              <tr className="border-b border-zinc-100 font-medium">
                <td className="py-2 pr-3 text-zinc-900">둘 중 하나라도 쓴 사람 (분자)</td>
                <td className="py-2 text-right tabular-nums">{num(activation.wroteAny)}명</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-900">활성화율</td>
                <td className="py-2 text-right">
                  <Rate rate={activation.rate} status={activation.status} />
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-zinc-600">첫 작성까지 걸린 시간(중앙값)</td>
                <td className="py-2 text-right tabular-nums">
                  {activation.medianHoursToFirst == null ? (
                    <span className="text-zinc-400">작성자 없음</span>
                  ) : (
                    `${activation.medianHoursToFirst}시간`
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="3단계 · 댓글 작성 → 다른 실회원의 답글"
        lead="커뮤니티가 살아 있는지 보는 핵심 루프. 본인 답글과 봇·비회원 답글은 루프로 세지 않고 따로 표시한다."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">{windowDays}일 실회원 댓글</td>
                <td className="py-2 text-right tabular-nums">{num(replyLoop.memberComments)}건</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">
                  성숙 전 제외 <span className="text-xs text-zinc-400">(작성 24시간 미경과)</span>
                </td>
                <td className="py-2 text-right tabular-nums text-amber-700">−{num(replyLoop.immature)}건</td>
              </tr>
              <tr className="border-b border-zinc-200 font-medium">
                <td className="py-2 pr-3 text-zinc-900">분모 (성숙 댓글)</td>
                <td className="py-2 text-right tabular-nums">{num(replyLoop.matureDenom)}건</td>
              </tr>
              <tr className="border-b border-zinc-100 font-medium">
                <td className="py-2 pr-3 text-zinc-900">다른 실회원의 답글을 받음 (분자)</td>
                <td className="py-2 text-right tabular-nums">{num(replyLoop.gotReplyFromMember)}건</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">답글이 본인 것뿐</td>
                <td className="py-2 text-right tabular-nums text-zinc-500">{num(replyLoop.selfReplyOnly)}건</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 pr-3 text-zinc-600">답글이 봇·비회원뿐</td>
                <td className="py-2 text-right tabular-nums text-zinc-500">{num(replyLoop.nonMemberReplyOnly)}건</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-zinc-900">답글 루프 발생률</td>
                <td className="py-2 text-right">
                  <Rate rate={replyLoop.rate} status={replyLoop.status} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="4단계 · 신규 실회원의 D1·D7 재방문"
        lead={retention.note.replace(/\*\*/g, '')}
      >
        <p className="mb-2 text-xs text-zinc-400">
          출처: <code>{retention.source}</code> · 관측 창 {retention.sourceWindowDays}일 (이 화면이 다시 계산하지 않고 기존 지표를 그대로 쓴다)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3">가입 채널</th>
                <th className="py-2 pr-3 text-right">D1 (분자/분모)</th>
                <th className="py-2 pr-3 text-right">D7 (분자/분모)</th>
                <th className="py-2 text-right">D30 (분자/분모)</th>
              </tr>
            </thead>
            <tbody>
              {retention.combined && (
                <tr className="border-b border-zinc-200 bg-zinc-50 font-medium">
                  <td className="py-2 pr-3">{retention.combined.segment}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {num(retention.combined.d1.returned)} / {num(retention.combined.d1.denom)}{' '}
                    <Rate rate={retention.combined.d1.rate} status="OK" />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {num(retention.combined.d7.returned)} / {num(retention.combined.d7.denom)}{' '}
                    <Rate rate={retention.combined.d7.rate} status="OK" />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {num(retention.combined.d30.returned)} / {num(retention.combined.d30.denom)}{' '}
                    <Rate rate={retention.combined.d30.rate} status="OK" />
                  </td>
                </tr>
              )}
              {retention.quadrants.map((q) => (
                <tr key={q.segment} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 text-zinc-600">{q.segment}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {num(q.d1.returned)} / {num(q.d1.denom)} <Rate rate={q.d1.rate} status="OK" />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {num(q.d7.returned)} / {num(q.d7.denom)} <Rate rate={q.d7.rate} status="OK" />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {num(q.d30.returned)} / {num(q.d30.denom)} <Rate rate={q.d30.rate} status="OK" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="데이터 품질 — 0 과 '모른다'를 구분한다"
        lead="비율이 낮은 것과 재지 못한 것은 다르다. 아래 항목을 보지 않고 위 숫자를 읽으면 오판한다."
      >
        <ul className="space-y-2">
          {data.dataQuality.map((d) => (
            <li key={d.key} className="flex gap-2 text-xs leading-5">
              <StatusChip status={d.level} />
              <span className="text-zinc-600">{d.message.replace(/`|\*\*/g, '')}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
