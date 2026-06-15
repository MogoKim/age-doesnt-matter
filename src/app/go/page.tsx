import type { Metadata } from 'next'
import GoRedirect from './GoRedirect'

export const metadata: Metadata = {
  title: '우나어로 이동',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ to?: string }>
}

export default async function GoPage({ searchParams }: PageProps) {
  const { to } = await searchParams
  // 오픈 리다이렉트 방지: 내부 경로(`/`로 시작, `//` 제외)만 허용
  const safeTo = to && to.startsWith('/') && !to.startsWith('//') ? to : '/'
  return <GoRedirect to={safeTo} />
}
