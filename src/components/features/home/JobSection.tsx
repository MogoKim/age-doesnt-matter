import Link from 'next/link'

import styles from './HomePage.module.css'

interface JobCard {
  id: string
  title: string
  location: string
  salary: string
  tags: string[]
  highlight?: string
  isUrgent?: boolean
}

const MOCK_JOBS: JobCard[] = [
  {
    id: '1',
    title: '도서관 사서 보조',
    location: '강남구',
    salary: '월 200만',
    tags: ['나이무관', '오전만'],
    highlight: '초보 환영, 오전만 근무',
  },
  {
    id: '2',
    title: '아파트 경비원',
    location: '서초구',
    salary: '월 220만',
    tags: ['60대 환영'],
    highlight: '주 5일, 교대 근무',
    isUrgent: true,
  },
  {
    id: '3',
    title: '카페 주방 보조',
    location: '마포구',
    salary: '시급 1.2만',
    tags: ['초보환영', '단기가능'],
    highlight: '주 3일 가능',
  },
  {
    id: '4',
    title: '학교 급식 보조',
    location: '송파구',
    salary: '월 180만',
    tags: ['나이무관'],
    highlight: '방학 중 휴무',
  },
  {
    id: '5',
    title: '주차장 관리원',
    location: '강동구',
    salary: '월 210만',
    tags: ['60대 환영', '야간없음'],
    highlight: '주간 근무만',
  },
]

export default function JobSection() {
  return (
    <section className={styles.jobSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>💼</span>
          오늘의 추천 일자리
        </h2>
        <Link href="/jobs" className={styles.sectionMoreLink}>
          전체보기 →
        </Link>
      </div>
      <div className={styles.jobScrollWrapper}>
        {MOCK_JOBS.map((job) => (
          <Link href={`/jobs/${job.id}`} key={job.id} className={styles.jobCard}>
            <div className={styles.jobTags}>
              {job.isUrgent && (
                <span className={`${styles.jobTag} ${styles.jobTagUrgent}`}>긴급</span>
              )}
              {job.tags.map((tag) => (
                <span key={tag} className={styles.jobTag}>
                  {tag}
                </span>
              ))}
            </div>
            <h3 className={styles.jobTitle}>{job.title}</h3>
            <div className={styles.jobMeta}>
              <span>{job.location}</span>
              <span>·</span>
              <span className={styles.jobSalary}>{job.salary}</span>
            </div>
            {job.highlight && <p className={styles.jobHighlight}>{job.highlight}</p>}
          </Link>
        ))}
      </div>
    </section>
  )
}
