import { prisma } from '@/lib/prisma'
import PushBroadcastForm from './PushBroadcastForm'
import InAppNoticeForm from '@/components/admin/InAppNoticeForm'
import NoticeHistory from '@/components/admin/NoticeHistory'
import { getNoticeHistory } from '@/lib/queries/admin/admin.notices'

export const dynamic = 'force-dynamic'

export default async function AdminPushPage() {
  // 구독 회원(푸시 허용) / 그중 마케팅 동의(광고 발송 가능) — 실고객·ACTIVE 기준
  const [subUsers, consentUsers, noticeHistory] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE', pushSubscriptions: { some: {} } } }),
    prisma.user.count({ where: { status: 'ACTIVE', pushSubscriptions: { some: {} }, marketingOptIn: true } }),
    getNoticeHistory(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">푸시 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          구독 회원 <span className="font-semibold text-zinc-900">{subUsers.toLocaleString()}명</span>
          {' · '}그중 마케팅 동의(광고 발송 가능) <span className="font-semibold text-zinc-900">{consentUsers.toLocaleString()}명</span>
        </p>
      </div>

      {/* 정책 안내 패널 */}
      <details className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium text-zinc-700">
          📌 푸시 알림 정책 — 누가 무엇을 받나요? (클릭해서 펼치기)
        </summary>
        <div className="mt-3 space-y-2 leading-relaxed text-zinc-600">
          <p>
            <b className="text-zinc-800">① 누가 받나</b> — <b>푸시를 허용한 구독 회원</b>만 폰에 알림이 갑니다.
            미구독 회원은 앱 안 종(🔔) 알림만 보고, OS 푸시는 못 받습니다.
          </p>
          <p>
            <b className="text-emerald-700">② 서비스 알림</b>(공지·안내) — 마케팅 동의가 <b>필요 없습니다</b>.
            구독 회원이면 누구나 받습니다.
          </p>
          <p>
            <b className="text-amber-700">③ 광고/마케팅</b>(혜택·이벤트) — <b>마케팅 동의자에게만</b> 발송됩니다.
            제목에 <b>(광고)</b> 자동 표기 + <b>야간 21~08시 차단</b> (정보통신망법 §50).
            미동의 회원을 골라도 시스템이 자동 제외합니다.
          </p>
          <p>
            <b className="text-zinc-800">④ 동의 수집</b> — 회원이 가입·글쓰기·댓글·방문 시 뜨는 토스트에서
            <b> "받을게요"</b>를 누르면 푸시 허용 + 마케팅 동의가 함께 기록됩니다(그래서 구독자=대부분 동의자).
          </p>
          <p className="text-xs text-zinc-500">
            상세: 채널 가이드 <code className="rounded bg-zinc-200 px-1">docs/channel-architecture.html</code> §5-4.
          </p>
        </div>
      </details>

      <PushBroadcastForm subUsers={subUsers} consentUsers={consentUsers} />

      {/* 전체 공지(인앱 종 알림 전원 + 구독자 OS푸시) — 구독·동의 무관 전원 도달 */}
      <InAppNoticeForm />

      {/* 공지 발송 이력 + 성과(읽음/클릭) */}
      <NoticeHistory notices={noticeHistory} />
    </div>
  )
}
