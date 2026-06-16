import type { NoticeHistoryItem } from '@/lib/queries/admin/admin.notices'

function pct(n: number, d: number): string {
  if (d <= 0) return '—'
  return `${Math.round((n / d) * 100)}%`
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function NoticeHistory({ notices }: { notices: NoticeHistoryItem[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-zinc-900">📋 공지 발송 이력 · 성과</h2>
      <p className="mt-1 text-xs text-zinc-500">
        <b>클릭</b>이 가장 정확한 행동 지표예요. <b>읽음</b>은 알림 클릭 또는 &lsquo;모두 읽음&rsquo;을 누른 수라 다소 높게 잡힐 수 있어요(참고용).
      </p>

      {notices.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">아직 발송한 전체 공지가 없어요.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-3 font-medium">발송시각</th>
                <th className="py-2 pr-3 font-medium">내용</th>
                <th className="py-2 pr-3 font-medium text-right">종 발송</th>
                <th className="py-2 pr-3 font-medium text-right">OS 푸시</th>
                <th className="py-2 pr-3 font-medium text-right">읽음</th>
                <th className="py-2 font-medium text-right">클릭</th>
              </tr>
            </thead>
            <tbody>
              {notices.map(n => (
                <tr key={n.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-zinc-500">{fmt(n.createdAt)}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-block mb-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${n.sentBell > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {n.sentBell > 0 ? '🔔 종 알림' : '📱 OS 푸시'}
                    </span>
                    <p className="text-zinc-800 line-clamp-2 max-w-[360px]">{n.body}</p>
                    {n.url && n.url !== '/' && <p className="text-xs text-zinc-400">→ {n.url}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium text-zinc-700">{n.sentBell > 0 ? n.sentBell.toLocaleString() : '—'}</td>
                  <td className="py-2.5 pr-3 text-right text-zinc-500">{n.sentPush.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {n.sentBell > 0 ? (
                      <>
                        <span className="font-medium text-zinc-700">{n.readCount.toLocaleString()}</span>
                        <span className="ml-1 text-xs text-zinc-400">{pct(n.readCount, n.sentBell)}</span>
                      </>
                    ) : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    {n.sentBell > 0 ? (
                      <>
                        <span className="font-bold text-indigo-700">{n.clickCount.toLocaleString()}</span>
                        <span className="ml-1 text-xs text-indigo-400">{pct(n.clickCount, n.sentBell)}</span>
                      </>
                    ) : <span className="text-zinc-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
