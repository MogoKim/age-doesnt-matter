import styles from './HomePage.module.css'

export default function AdInline() {
  return (
    <aside className={styles.adInline}>
      <span className={styles.adLabel}>광고</span>
      <div className={styles.adPlaceholder}>광고 영역</div>
    </aside>
  )
}
