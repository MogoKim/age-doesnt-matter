import { Fragment } from 'react'
import FeedAd from '@/components/ad/FeedAd'
import CoupangHome1 from '@/components/ad/CoupangHome1'

interface Props<T> {
  items: T[]
  renderCard: (item: T, index: number) => React.ReactNode
  className?: string
}

export default function PostListWithAds<T>({ items, renderCard, className }: Props<T>) {
  return (
    <div className={className ?? ''}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {renderCard(item, index)}
          {index === 3 && <FeedAd />}
          {index === 7 && <CoupangHome1 className="my-6" />}
        </Fragment>
      ))}
    </div>
  )
}
