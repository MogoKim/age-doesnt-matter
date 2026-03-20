import Link from 'next/link'

import styles from './HomePage.module.css'

interface MagazineArticle {
  id: string
  title: string
  category: string
}

const MOCK_MAGAZINE: MagazineArticle[] = [
  {
    id: '1',
    title: '60대 건강검진, 꼭 챙겨야 할 5가지',
    category: '건강',
  },
  {
    id: '2',
    title: '퇴직연금 수령 시 세금 줄이는 방법',
    category: '재테크',
  },
  {
    id: '3',
    title: '봄맞이 근교 나들이 추천 코스 7선',
    category: '여행',
  },
  {
    id: '4',
    title: '스마트폰 사기 피하는 법, 어르신 필독',
    category: '생활정보',
  },
]

export default function MagazineSection() {
  return (
    <section className={styles.magazineSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>📖</span>
          매거진
        </h2>
        <Link href="/magazine" className={styles.sectionMoreLink}>
          전체보기 →
        </Link>
      </div>
      <div className={styles.magazineGrid}>
        {MOCK_MAGAZINE.map((article) => (
          <Link
            href={`/magazine/${article.id}`}
            key={article.id}
            className={styles.magazineCard}
          >
            <div
              className={styles.magazineThumbnail}
              role="img"
              aria-label={article.title}
            />
            <div className={styles.magazineBody}>
              <span className={styles.magazineCategory}>{article.category}</span>
              <h3 className={styles.magazineTitle}>{article.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
