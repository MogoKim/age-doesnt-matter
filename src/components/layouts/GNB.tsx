'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import styles from './GNB.module.css'

const MENU_ITEMS = [
  { label: '베스트', href: '/best' },
  { label: '내 일 찾기', href: '/jobs' },
  { label: '사는 이야기', href: '/community/stories' },
  { label: '활력 충전소', href: '/community/humor' },
  { label: '매거진', href: '/magazine' },
] as const

interface GNBProps {
  isLoggedIn?: boolean
  nickname?: string
}

export default function GNB({ isLoggedIn = false, nickname }: GNBProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState('')

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  return (
    <nav className={styles.gnb} aria-label="메인 네비게이션">
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} aria-label="우나어 홈">
          <span className={styles.logoIcon}>🟠</span>
          <span>우나어</span>
        </Link>

        <div className={styles.menu}>
          {MENU_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.menuItem} ${isActive ? styles.menuActive : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <form className={styles.searchBox} onSubmit={handleSearch}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="통합검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="통합검색"
          />
          <button type="submit" aria-label="검색" style={{ fontSize: 16 }}>
            🔍
          </button>
        </form>

        {isLoggedIn ? (
          <Link href="/my" className={styles.profile}>
            <span className={styles.profileAvatar}>👤</span>
            <span>{nickname}</span>
          </Link>
        ) : (
          <Link href="/login" className={styles.profile}>
            로그인
          </Link>
        )}
      </div>
    </nav>
  )
}
