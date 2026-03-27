import AdSenseUnit from './AdSenseUnit'

interface FeedAdProps {
  format?: 'auto' | 'horizontal' | 'rectangle'
  className?: string
}

/**
 * 피드/목록 중간에 삽입하는 인라인 광고
 * 커뮤니티 목록, 매거진 목록, 일자리 목록, 베스트 등에서 사용
 */
export default function FeedAd({ format = 'horizontal', className }: FeedAdProps) {
  return (
    <div className={`my-4 ${className ?? ''}`}>
      <AdSenseUnit slotId="auto" format={format} className="rounded-2xl overflow-hidden" />
    </div>
  )
}
