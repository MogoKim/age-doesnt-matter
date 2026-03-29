import AdSenseUnit from './AdSenseUnit'
import { ADSENSE } from './ad-slots'

interface FeedAdProps {
  className?: string
}

/**
 * 피드/목록 중간에 삽입하는 인피드 광고
 * 커뮤니티 목록, 매거진 목록, 일자리 목록, 베스트, 홈 피드에서 사용
 */
export default function FeedAd({ className }: FeedAdProps) {
  return (
    <div className={`my-4 ${className ?? ''}`}>
      <AdSenseUnit
        slotId={ADSENSE.IN_FEED}
        format="fluid"
        layoutKey={ADSENSE.IN_FEED_LAYOUT_KEY}
        className="rounded-2xl overflow-hidden"
      />
    </div>
  )
}
