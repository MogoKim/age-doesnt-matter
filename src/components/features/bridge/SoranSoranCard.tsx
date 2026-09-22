import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 홈 중반부 소란소란 안내 카드 (서버 컴포넌트).
 *
 * 비회원 가입 유도 카드(`SignupCard`)가 있던 자리를 그대로 쓴다.
 * 데스크탑 하단 AdSense 의 바로 앞 섹션이므로 **광고 인접 관계가 유지**된다.
 * 팝업과 같은 방침으로 **카드 전체가 링크**다.
 */
export default function SoranSoranCard() {
  return (
    <section className="py-6 px-4 lg:px-0">
      <a
        href={bridgeUrl('homecard')}
        target="_blank"
        rel="noopener"
        className="flex flex-col items-center gap-4 rounded-2xl p-6 text-center no-underline transition-opacity hover:opacity-90"
        style={{ background: 'var(--surface-coral-pale)' }}
      >
        <div className="space-y-1">
          <p className="m-0 text-title font-bold text-foreground break-keep">{BRIDGE_COPY.title}</p>
          <p className="m-0 text-body text-muted-foreground break-keep">{BRIDGE_COPY.bodyKnown}</p>
          <p className="m-0 text-body font-bold text-primary-text break-keep">{BRIDGE_COPY.hook}</p>
        </div>

        <span className="inline-flex min-h-control w-full max-w-[320px] items-center justify-center rounded-2xl bg-primary px-4 py-2 text-center text-body font-bold leading-tight text-primary-foreground break-keep">
          {BRIDGE_COPY.cta} →
        </span>
      </a>
    </section>
  )
}
