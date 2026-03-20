'use client'

import { useState } from 'react'
import styles from './Community.module.css'

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
    // TODO: API 연동
    setIsLiked(!isLiked)
    setLikes(isLiked ? likes - 1 : likes + 1)
  }

  function handleScrap() {
    // TODO: API 연동
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

  return (
    <div className={styles.actionBar}>
      <button
        className={isLiked ? styles.actionBtnActive : styles.actionBtn}
        onClick={handleLike}
        aria-label={isLiked ? '공감 취소' : '공감'}
      >
        {isLiked ? '❤️' : '🤍'} 공감 {likes > 0 && likes}
      </button>
      <button
        className={isScrapped ? styles.actionBtnActive : styles.actionBtn}
        onClick={handleScrap}
        aria-label={isScrapped ? '스크랩 취소' : '스크랩'}
      >
        📌 스크랩
      </button>
      <button className={styles.actionBtn} onClick={handleShare} aria-label="공유">
        🔗 공유
      </button>
      <button className={styles.actionBtn} aria-label="신고">
        🚨 신고
      </button>
    </div>
  )
}
