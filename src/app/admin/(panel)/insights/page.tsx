import { redirect } from 'next/navigation'

// 인사이트는 대시보드(/admin)로 통합됨 — 기존 북마크·링크 보존용 리다이렉트.
export default function AdminInsightsPage() {
  redirect('/admin')
}
