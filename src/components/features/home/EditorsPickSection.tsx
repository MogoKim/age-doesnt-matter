import Link from 'next/link'

import styles from './HomePage.module.css'

interface EditorsPost {
  id: string
  title: string
  excerpt: string
  likeCount: number
  commentCount: number
  board: string
}

const MOCK_EDITORS: EditorsPost[] = [
  {
    id: '1',
    title: '남편이 퇴직하고 처음 해준 요리 이야기',
    excerpt: '가슴이 뭉클해서 눈물이 날 것 같았어요. 40년 동안 회사만 다니던 남편이 처음으로 부엌에 섰거든요.',
    likeCount: 45,
    commentCount: 23,
    board: 'stories',
  },
  {
    id: '2',
    title: '60대에 시작한 그림 일기, 1년의 기록',
    excerpt: '퇴직 후 무료해서 시작한 그림 일기가 어느덧 365장이 되었습니다. 매일의 소소한 행복을 그렸어요.',
    likeCount: 38,
    commentCount: 17,
    board: 'stories',
  },
]

export default function EditorsPickSection() {
  return (
    <section className={styles.editorsSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>⭐</span>
          에디터스 픽
        </h2>
      </div>
      <div className={styles.editorsGrid}>
        {MOCK_EDITORS.map((post) => (
          <Link
            href={`/community/${post.board}/${post.id}`}
            key={post.id}
            className={styles.editorsCard}
          >
            <div
              className={styles.editorsThumbnail}
              role="img"
              aria-label={post.title}
            />
            <div className={styles.editorsBody}>
              <span className={styles.editorsBadge}>⭐ PO 추천</span>
              <h3 className={styles.editorsTitle}>{post.title}</h3>
              <p className={styles.editorsExcerpt}>{post.excerpt}</p>
              <div className={styles.editorsFooter}>
                <span>❤️ {post.likeCount}</span>
                <span>💬 {post.commentCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
