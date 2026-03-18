'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './FAB.module.css'

const FAB_PAGES = ['/community/stories', '/community/humor']

export default function FAB() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const showFAB = FAB_PAGES.some((page) => pathname === page)

  useEffect(() => {
    if (!showFAB) return

    let lastY = window.scrollY

    const handleScroll = () => {
      const currentY = window.scrollY
      setCollapsed(currentY > lastY && currentY > 100)
      lastY = currentY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showFAB])

  if (!showFAB) return null

  const board = pathname.includes('stories') ? 'STORIES' : 'HUMOR'

  return (
    <Link
      href={`/community/write?board=${board}`}
      className={`${styles.fab} ${collapsed ? styles.collapsed : ''}`}
      aria-label="글쓰기"
    >
      <span className={styles.fabIcon}>✏️</span>
      <span className={styles.fabLabel}>글쓰기</span>
    </Link>
  )
}
