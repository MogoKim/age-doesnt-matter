'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './Community.module.css'

interface BoardFilterProps {
  categories: string[]
  boardSlug: string
}

export default function BoardFilter({ categories, boardSlug }: BoardFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get('category') || '전체'

  function handleSelect(category: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (category === '전체') {
      params.delete('category')
    } else {
      params.set('category', category)
    }
    router.push(`/community/${boardSlug}?${params.toString()}`)
  }

  return (
    <div className={styles.filterChips} role="tablist" aria-label="카테고리 필터">
      {categories.map((cat) => (
        <button
          key={cat}
          role="tab"
          aria-selected={currentCategory === cat}
          className={currentCategory === cat ? styles.filterChipActive : styles.filterChip}
          onClick={() => handleSelect(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
