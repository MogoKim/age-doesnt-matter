import Link from 'next/link'

import styles from './HomePage.module.css'

export default function IdentitySection() {
  return (
    <section className={styles.identitySection}>
      <p className={styles.identityText}>
        50·60대 일자리와 따뜻한 수다,
        <br />
        우나어에서 만나요
      </p>
      <Link href="/about" className={styles.identityLink}>
        처음이신가요? 우나어 알아보기 →
      </Link>
    </section>
  )
}
