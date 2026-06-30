import { redirect } from 'next/navigation'

// 운영 상황판은 /admin 메인 대시보드에 통합됨. 기존 북마크·링크 보존용 리다이렉트.
export default function AdminAnalyticsPage() {
  redirect('/admin')
}
