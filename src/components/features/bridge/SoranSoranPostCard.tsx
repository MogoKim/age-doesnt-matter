import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 글 상세 하단 인라인 카드 (서버 컴포넌트).
 *
 * 검색으로 글 하나 보러 온 사람이 **다 읽은 직후** 만나는 자리다
 * (`PostCTA` 다음, 관련글 추천 앞). 팝업과 같은 방침으로 **카드 전체가 링크**다.
 */
export default function SoranSoranPostCard() {
  return (
    <section className="mb-12">
      <a
        href={bridgeUrl('postdetail')}
        target="_blank"
        rel="noopener"
        className="block rounded-2xl border border-primary/20 bg-primary/5 p-5 no-underline transition-colors hover:bg-primary/10"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden="true">
            💬
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-body font-bold text-foreground break-keep">
              {BRIDGE_COPY.post.title}
            </p>
            <p className="mt-1 m-0 text-caption text-muted-foreground break-keep">
              {BRIDGE_COPY.post.body}
            </p>
            <p className="mt-1 m-0 text-caption font-semibold text-primary-text break-keep">
              {BRIDGE_COPY.post.hook}
            </p>
          </div>
        </div>

        <span className="mt-4 flex min-h-control w-full items-center justify-center rounded-lg border border-primary bg-background px-4 py-2 text-center text-body font-bold leading-tight text-primary-text break-keep">
          {BRIDGE_COPY.post.cta} →
        </span>
      </a>
    </section>
  )
}
