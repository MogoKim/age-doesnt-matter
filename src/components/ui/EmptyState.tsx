import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon?: string
  message: string
  sub?: string
  children?: React.ReactNode
}

export default function EmptyState({ icon = '📭', message, sub, children }: EmptyStateProps) {
  return (
    <div className={styles.container}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <p className={styles.message}>{message}</p>
      {sub && <p className={styles.sub}>{sub}</p>}
      {children && <div className={styles.cta}>{children}</div>}
    </div>
  )
}
