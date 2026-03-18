'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './IconMenu.module.css'

const MENU_ITEMS = [
  { icon: '⭐', label: '베스트', href: '/best' },
  { icon: '💼', label: '내 일 찾기', href: '/jobs' },
  { icon: '💬', label: '사는 이야기', href: '/community/stories' },
  { icon: '⚡', label: '활력 충전소', href: '/community/humor' },
  { icon: '📖', label: '매거진', href: '/magazine' },
] as const

export default function IconMenu() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav} aria-label="주요 메뉴">
      {MENU_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.item} ${isActive ? styles.active : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
