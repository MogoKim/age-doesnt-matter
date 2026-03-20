import type { Metadata } from 'next'
import PostWriteForm from '@/components/features/community/PostWriteForm'
import styles from '@/components/features/community/Community.module.css'

export const metadata: Metadata = {
  title: '글쓰기',
  description: '새로운 글을 작성합니다.',
}

interface PageProps {
  searchParams: Promise<{ board?: string }>
}

export default async function WritePage({ searchParams }: PageProps) {
  const { board } = await searchParams

  return (
    <div className={styles.writeContainer}>
      <h1 className={styles.writeTitle}>글쓰기</h1>
      <PostWriteForm defaultBoard={board} />
    </div>
  )
}
