'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ActionBarProps {
  likeCount: number
  isLiked: boolean
  isScrapped: boolean
}

export default function ActionBar({ likeCount, isLiked: initialLiked, isScrapped: initialScrapped }: ActionBarProps) {
  const [isLiked, setIsLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(likeCount)
  const [isScrapped, setIsScrapped] = useState(initialScrapped)

  function handleLike() {
    setIsLiked(!isLiked)
    setLikes(isLiked ? likes - 1 : likes + 1)
  }

  function handleScrap() {
    setIsScrapped(!isScrapped)
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: document.title,
        url: window.location.href,
      })
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('링크가 복사되었어요!')
    }
  }

  const btnBase = 'flex items-center gap-1.5 min-h-[52px] min-w-[52px] px-4 py-2 bg-none border-none text-muted-foreground text-xs font-medium cursor-pointer rounded-xl transition-all justify-center hover:text-primary hover:bg-primary/5'

  return (
    <div className="flex items-center justify-around bg-card border border-border rounded-2xl py-2 mb-8 shadow-sm">
      <button
        className={cn(btnBase, isLiked && 'text-primary font-bold')}
        onClick={handleLike}
        aria-label={isLiked ? '공감 취소' : '공감'}
      >
        {isLiked ? '❤️' : '🤍'} 공감 {likes > 0 && likes}
      </button>
      <button
        className={cn(btnBase, isScrapped && 'text-primary font-bold')}
        onClick={handleScrap}
        aria-label={isScrapped ? '스크랩 취소' : '스크랩'}
      >
        📌 스크랩
      </button>
      <button className={btnBase} onClick={handleShare} aria-label="공유">
        🔗 공유
      </button>
      <button className={btnBase} aria-label="신고">
        🚨 신고
      </button>
    </div>
  )
}
