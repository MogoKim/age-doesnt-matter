import Link from 'next/link'

import styles from './HomePage.module.css'

interface CommunityPost {
  id: string
  title: string
  board: string
  boardLabel: string
  author: string
  commentCount: number
  likeCount: number
  timeAgo: string
}

const MOCK_COMMUNITY: CommunityPost[] = [
  {
    id: '1',
    title: '오늘 날씨 좋아서 산책 다녀왔어요',
    board: 'stories',
    boardLabel: '사는이야기',
    author: '행복한봄날',
    commentCount: 5,
    likeCount: 12,
    timeAgo: '10분 전',
  },
  {
    id: '2',
    title: '손주 돌잔치 사진 올려봅니다 ㅎㅎ',
    board: 'stories',
    boardLabel: '사는이야기',
    author: '할미꽃',
    commentCount: 8,
    likeCount: 21,
    timeAgo: '25분 전',
  },
  {
    id: '3',
    title: '요즘 웃긴 동영상 하나 공유할게요',
    board: 'humor',
    boardLabel: '활력충전소',
    author: '웃음가득',
    commentCount: 14,
    likeCount: 33,
    timeAgo: '1시간 전',
  },
  {
    id: '4',
    title: '퇴직 후 텃밭 가꾸기 시작했는데 질문이요',
    board: 'stories',
    boardLabel: '사는이야기',
    author: '초보농부',
    commentCount: 7,
    likeCount: 9,
    timeAgo: '2시간 전',
  },
  {
    id: '5',
    title: '50대 후반인데 이직 고민 중입니다',
    board: 'stories',
    boardLabel: '사는이야기',
    author: '새출발',
    commentCount: 19,
    likeCount: 27,
    timeAgo: '3시간 전',
  },
]

export default function CommunitySection() {
  return (
    <section className={styles.communitySection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>💬</span>
          소통 마당 최신
        </h2>
        <Link href="/community/stories" className={styles.sectionMoreLink}>
          더보기 →
        </Link>
      </div>
      <ul className={styles.communityList}>
        {MOCK_COMMUNITY.map((post) => (
          <li key={post.id}>
            <Link
              href={`/community/${post.board}/${post.id}`}
              className={styles.communityItem}
            >
              <div className={styles.communityItemHeader}>
                <span className={styles.communityBoardTag}>{post.boardLabel}</span>
                <span className={styles.communityAuthor}>{post.author}</span>
              </div>
              <p className={styles.communityTitle}>{post.title}</p>
              <div className={styles.communityMeta}>
                <span>💬 {post.commentCount}</span>
                <span>❤️ {post.likeCount}</span>
                <span>{post.timeAgo}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
