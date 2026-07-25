'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import Chip from '@/components/ui/Chip'
import ScrollableChipRow from '@/components/ui/ScrollableChipRow'

const QUICK_TAGS = ['나이무관', '초보환영', '오전', '오후', '주3일', '주5일']

export default function JobQuickTags() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTags = searchParams.get('tags')?.split(',').filter(Boolean) ?? []

  const toggleTag = useCallback(
    (tag: string) => {
      const params = new URLSearchParams(searchParams.toString())
      const current = params.get('tags')?.split(',').filter(Boolean) ?? []

      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]

      if (next.length > 0) {
        params.set('tags', next.join(','))
      } else {
        params.delete('tags')
      }
      params.delete('cursor')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  return (
    <ScrollableChipRow>
        {QUICK_TAGS.map((tag) => {
          const isActive = activeTags.includes(tag)
          return (
            <Chip
              key={tag}
              active={isActive}
              muted
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Chip>
          )
        })}
    </ScrollableChipRow>
  )
}
