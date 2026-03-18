import Link from 'next/link'
import styles from './Footer.module.css'

const FOOTER_LINKS = [
  { label: '회사소개', href: '/about' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy' },
  { label: '문의', href: '/contact' },
] as const

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links}>
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={styles.link}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p className={styles.copyright}>&copy; 2026 우리 나이가 어때서</p>
    </footer>
  )
}
