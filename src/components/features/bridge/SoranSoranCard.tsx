import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 홈 중반부 소란소란 안내 카드 (서버 컴포넌트).
 *
 * 비회원 가입 유도 카드(`SignupCard`)가 있던 자리를 그대로 쓴다.
 * 데스크탑 하단 AdSense 의 바로 앞 섹션이므로 **광고 인접 관계가 복원**된다.
 */
export default function SoranSoranCard() {
  return (
    <section className="py-6 px-4 lg:px-0">
      <div
        className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
        style={{ background: 'var(--surface-coral-pale)' }}
      >
        <div className="space-y-1">
          <p className="text-title font-bold text-foreground break-keep">{BRIDGE_COPY.title}</p>
          <p className="text-body text-muted-foreground break-keep">{BRIDGE_COPY.bodyKnown}</p>
          <p className="text-body font-bold text-primary break-keep">{BRIDGE_COPY.hook}</p>
        </div>

        <a
          href={bridgeUrl('homecard')}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-control w-full max-w-[320px] items-center justify-center rounded-2xl bg-primary px-4 py-2 text-center text-body font-bold leading-tight text-white no-underline break-keep transition-opacity hover:opacity-90"
        >
          {BRIDGE_COPY.cta}
        </a>

        <p className="text-caption text-muted-foreground break-keep m-0">{BRIDGE_COPY.reassure}</p>
      </div>
    </section>
  )
}
