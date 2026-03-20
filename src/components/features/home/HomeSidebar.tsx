import Link from 'next/link'

import styles from './HomePage.module.css'

const MOCK_SIDEBAR_POSTS = [
  { id: '1', title: '오늘 날씨 좋아서 산책 다녀왔어요', board: 'stories' },
  { id: '2', title: '손주 돌잔치 사진 올려봅니다 ㅎㅎ', board: 'stories' },
  { id: '3', title: '요즘 웃긴 동영상 하나 공유할게요', board: 'humor' },
  { id: '4', title: '퇴직 후 텃밭 가꾸기 시작했는데 질문이요', board: 'stories' },
  { id: '5', title: '50대 후반인데 이직 고민 중입니다', board: 'stories' },
]

export default function HomeSidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarWidget}>
        <h3 className={styles.sidebarWidgetTitle}>💬 최신 소통글</h3>
        <ul className={styles.sidebarPostList}>
          {MOCK_SIDEBAR_POSTS.map((post) => (
            <li key={post.id}>
              <Link
                href={`/community/${post.board}/${post.id}`}
                className={styles.sidebarPostItem}
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.sidebarAd}>
        <span className={styles.adLabel}>광고</span>
        광고 영역
      </div>
    </aside>
  )
}
