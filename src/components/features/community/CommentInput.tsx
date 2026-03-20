'use client'

import { useState } from 'react'
import styles from './Community.module.css'

export default function CommentInput() {
  const [value, setValue] = useState('')

  function handleSubmit() {
    if (!value.trim()) return
    // TODO: API 연동
    alert('댓글 등록 기능은 API 연동 후 사용할 수 있어요.')
    setValue('')
  }

  return (
    <div className={styles.commentInputWrap}>
      <textarea
        className={styles.commentInput}
        placeholder="댓글을 남겨주세요..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
      />
      <button
        className={styles.commentSubmitBtn}
        disabled={!value.trim()}
        onClick={handleSubmit}
      >
        등록
      </button>
    </div>
  )
}
