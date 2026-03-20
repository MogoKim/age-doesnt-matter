'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BOARD_CONFIGS } from './mock-data'
import styles from './Community.module.css'

const WRITABLE_BOARDS = ['stories', 'humor'] as const

interface PostWriteFormProps {
  defaultBoard?: string
}

export default function PostWriteForm({ defaultBoard }: PostWriteFormProps) {
  const router = useRouter()
  const [selectedBoard, setSelectedBoard] = useState(defaultBoard || 'stories')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const board = BOARD_CONFIGS[selectedBoard]
  const categories = board?.categories.filter((c) => c !== '전체') || []

  const isTitleValid = title.length >= 2 && title.length <= 40
  const isContentValid = content.length >= 10
  const canSubmit = isTitleValid && isContentValid && selectedBoard

  function handleBoardChange(slug: string) {
    setSelectedBoard(slug)
    setSelectedCategory('')
  }

  function handleCancel() {
    if (title || content) {
      if (!confirm('작성 중인 내용이 사라져요. 나가시겠어요?')) return
    }
    router.back()
  }

  function handleSubmit() {
    if (!canSubmit) return
    // TODO: API 연동
    alert('글이 등록되었어요!')
    router.push(`/community/${selectedBoard}`)
  }

  return (
    <>
      {/* 게시판 선택 */}
      <div className={styles.boardSelector}>
        {WRITABLE_BOARDS.map((slug) => {
          const b = BOARD_CONFIGS[slug]
          return (
            <button
              key={slug}
              className={selectedBoard === slug ? styles.boardOptionActive : styles.boardOption}
              onClick={() => handleBoardChange(slug)}
            >
              {b.displayName}
            </button>
          )
        })}
      </div>

      {/* 카테고리 선택 */}
      {categories.length > 0 && (
        <div className={styles.categorySelector}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={selectedCategory === cat ? styles.filterChipActive : styles.filterChip}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 제목 입력 */}
      <div className={styles.writeField}>
        <label className={styles.writeLabel}>
          제목 <span className={styles.writeRequired}>*</span>
        </label>
        <input
          type="text"
          className={styles.writeTitleInput}
          placeholder="제목을 입력해 주세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
        />
        <div className={title.length > 40 || (title.length > 0 && title.length < 2) ? styles.writeCharCountError : styles.writeCharCount}>
          {title.length}/40
        </div>
      </div>

      {/* 본문 입력 */}
      <div className={styles.writeField}>
        <label className={styles.writeLabel}>
          본문 <span className={styles.writeRequired}>*</span>
        </label>
        <textarea
          className={styles.writeContentInput}
          placeholder="내용을 입력해 주세요 (10자 이상)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className={content.length > 0 && content.length < 10 ? styles.writeCharCountError : styles.writeCharCount}>
          {content.length}자
        </div>
      </div>

      {/* 이미지 첨부 (등급 제한 안내) */}
      <div className={styles.imageAttach}>
        <button className={styles.imageAttachBtnDisabled} disabled>
          📷 이미지 첨부 (단골 등급부터 가능해요)
        </button>
        <p className={styles.imageAttachHint}>최대 5장, 각 5MB 이하</p>
      </div>

      {/* 하단 액션바 */}
      <div className={styles.writeActionBar}>
        <button className={styles.writeCancelBtn} onClick={handleCancel}>
          취소
        </button>
        <div className={styles.writeActions}>
          <button
            className={styles.writeSubmitBtn}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            등록하기
          </button>
        </div>
      </div>
    </>
  )
}
