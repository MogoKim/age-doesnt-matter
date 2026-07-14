import { notFound } from 'next/navigation'
import VotePopupPreviewClient from './preview-client'

/**
 * 투표 팝업 디자인 검토 하네스 — 로컬 개발 전용.
 * production 빌드(Vercel 프로덕션/프리뷰 포함)에서는 404 — 고객 접근 불가.
 * 사용: npm run dev → http://localhost:3000/dev/vote-popup-preview (뷰포트 375×812 권장)
 */
export default function VotePopupPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <VotePopupPreviewClient />
}
