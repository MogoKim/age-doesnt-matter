import styles from './Skeleton.module.css'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  circle?: boolean
  className?: string
}

export default function Skeleton({ width, height, circle, className }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${circle ? styles.circle : ''} ${className ?? ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

/** 카드 목록 스켈레톤 (3개) */
export function CardSkeleton() {
  return (
    <div className={styles.card}>
      <div className={`${styles.skeleton} ${styles.line} ${styles.lineShort}`} />
      <div className={`${styles.skeleton} ${styles.line}`} />
      <div className={`${styles.skeleton} ${styles.line}`} />
      <div className={`${styles.skeleton} ${styles.lineTiny}`} />
    </div>
  )
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </>
  )
}
