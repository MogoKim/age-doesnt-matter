import { buttonVariants } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { BRIDGE_COPY, bridgeUrl } from '@/lib/bridge'

/**
 * Project BRIDGE — 글 상세 하단 인라인 카드 (서버 컴포넌트).
 *
 * 🔴 **SEO 유입의 유일한 접점이다.** 검색으로 글 하나 보러 온 사람은 홈을 거치지 않으므로
 *    홈 카드도 못 보고, 읽기 화면에서는 팝업도 뜨지 않는다(의도).
 *    그래서 **다 읽은 직후** 이 자리에서 한 번 제안한다.
 *
 * 모달처럼 끊지 않고 "다음에 읽을 곳"으로 이어지게 둔다 —
 * 바로 아래 관련글 추천(NextPostsInline)과 같은 결이다.
 */
export default function SoranSoranPostCard() {
  return (
    <section className="mb-12">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
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

        <a
          href={bridgeUrl('postdetail')}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4 w-full no-underline')}
        >
          {BRIDGE_COPY.post.cta} →
        </a>
      </div>
    </section>
  )
}
