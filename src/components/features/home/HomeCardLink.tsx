'use client'

import Link from 'next/link'
import { gtmHomeCardClick } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import type { ComponentProps } from 'react'

type Section = 'trending' | 'community' | 'magazine' | 'jobs' | 'life2' | 'stories-hot' | 'humor-hot'

interface Props extends Omit<ComponentProps<typeof Link>, 'onClick'> {
  section: Section
  position: number
  contentId: string
  action?: 'card' | 'more'
}

export default function HomeCardLink({ section, position, contentId, action = 'card', ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={() => {
        gtmHomeCardClick(section, position, contentId, action)
        trackEvent('home_card_click', { section, position, content_id: contentId, action })
      }}
    />
  )
}
