/**
 * ActivityPulse — 회원/비회원 공용 실시간 커뮤니티 현황 표시
 * 실제 통계 대신 고정 메시지로 활기 전달 (서버 쿼리 없음)
 */

const PULSES = [
  { emoji: '💬', text: '지금 사는이야기에서 활발하게 소통 중이에요' },
  { emoji: '🌱', text: '2막 준비 정보를 나누는 분들이 많아요' },
  { emoji: '📖', text: '오늘의 매거진이 업데이트됐어요' },
]

export default function ActivityPulse() {
  return (
    <section className="py-4 px-4 lg:px-0">
      <div className="flex flex-col gap-2">
        {PULSES.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border"
          >
            {/* 펄스 점 */}
            <span
              className="shrink-0 w-2 h-2 rounded-full"
              style={{
                background: 'var(--pulse-dot-color)',
                boxShadow: '0 0 0 4px var(--pulse-dot-glow)',
              }}
              aria-hidden="true"
            />
            <span className="text-[15px]" aria-hidden="true">{item.emoji}</span>
            <p className="text-caption text-muted-foreground break-keep m-0">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
