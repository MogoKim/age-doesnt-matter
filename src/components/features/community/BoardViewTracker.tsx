'use client'

import { useEffect } from 'react'
import { sendGtmEvent } from '@/lib/gtm'

interface BoardViewTrackerProps {
  boardType: string
  boardSlug: string
}

/**
 * 게시판 목록 페이지 진입 시 board_view 이벤트 발사.
 * 서버 컴포넌트인 BoardListPage에서 클라이언트 이벤트를 발사하기 위한 래퍼.
 */
export default function BoardViewTracker({ boardType, boardSlug }: BoardViewTrackerProps) {
  useEffect(() => {
    sendGtmEvent('board_view', { board_type: boardType, board_slug: boardSlug })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
