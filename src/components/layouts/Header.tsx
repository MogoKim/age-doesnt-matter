import Link from 'next/link'
import styles from './Header.module.css'

interface HeaderProps {
  isLoggedIn?: boolean
}

export default function Header({ isLoggedIn = false }: HeaderProps) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="우나어 홈">
        <span className={styles.logoIcon}>🟠</span>
        <span>우나어</span>
      </Link>

      <div className={styles.actions}>
        <Link href="/search" className={styles.iconButton} aria-label="검색">
          🔍
        </Link>
        <Link
          href={isLoggedIn ? '/my' : '/login'}
          className={styles.iconButton}
          aria-label={isLoggedIn ? '마이페이지' : '로그인'}
        >
          👤
        </Link>
      </div>
    </header>
  )
}
