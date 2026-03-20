import Link from 'next/link'

import styles from './HomePage.module.css'

interface TrendingPost {
  id: string
  title: string
  commentCount: number
  likeCount: number
  board: string
  boardLabel: string
}

const MOCK_TRENDING: TrendingPost[] = [
  {
    id: '1',
    title: '퇴직 후 처음 카페에서 알바한 썰... 생각보다 재밌었어요',
    commentCount: 24,
    likeCount: 67,
    board: 'humor',
    boardLabel: '활력충전소',
  },
  {
    id: '2',
    title: '손주가 어제 처음 불렀어요 "할머니" 가슴이 뭉클해서...',
    commentCount: 12,
    likeCount: 34,
    board: 'stories',
    boardLabel: '사는이야기',
  },
  {
    id: '3',
    title: '기초연금 인상 소식, 이제 확정됐대요',
    commentCount: 8,
    likeCount: 29,
    board: 'magazine',
    boardLabel: '매거진',
  },
  {
    id: '4',
    title: '60살에 운전면허 따는 중인데 요즘 세상 좋아졌어요',
    commentCount: 31,
    likeCount: 52,
    board: 'humor',
    boardLabel: '활력충전소',
  },
  {
    id: '5',
    title: '은퇴 후 부부 여행 다녀온 후기 (제주도 3박4일)',
    commentCount: 15,
    likeCount: 41,
    board: 'stories',
    boardLabel: '사는이야기',
  },
]

export default function TrendingSection() {
  return (
    <section className={styles.trendingSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>🔥</span>
          지금 뜨는 이야기
        </h2>
        <Link href="/best" className={styles.sectionMoreLink}>
          더보기 →
        </Link>
      </div>
      <ol className={styles.trendingList}>
        {MOCK_TRENDING.map((post, index) => (
          <li key={post.id}>
            <Link
              href={`/community/${post.board}/${post.id}`}
              className={styles.trendingItem}
            >
              <span className={styles.trendingRank}>{index + 1}</span>
              <div className={styles.trendingContent}>
                <p className={styles.trendingTitle}>{post.title}</p>
                <div className={styles.trendingMeta}>
                  <span>💬 {post.commentCount}</span>
                  <span>❤️ {post.likeCount}</span>
                  <span className={styles.trendingBoardTag}>{post.boardLabel}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
