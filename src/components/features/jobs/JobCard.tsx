import Link from 'next/link'
import type { JobCardItem } from '@/lib/queries/posts'
import { formatTimeAgo } from '@/components/features/community/utils'
import { formatSalary } from '@/lib/format'
import { IconEye } from '@/components/icons'

/**
 * JobCard — 일자리 목록 카드 (서버 컴포넌트, /jobs 목록 + 지역 페이지 공용)
 * - 지역 뱃지: 구직자 핵심 정보 노출 (Track 1에서 지역 페이지 링크로 승격 예정)
 * - 메타 아이콘: 다른 화면과 동일하게 SVG(IconEye) 사용
 * - 댓글 수 미표시: 내일찾기는 매거진과 같은 정보성 콘텐츠라 상세에 댓글 영역이 없다.
 *   목록에만 댓글 수가 보이면 "눌러도 댓글이 없는" 불일치가 생겨 MagazineCard와 동일하게 조회수·시간만 노출.
 */
export default function JobCard({ job }: { job: JobCardItem }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block p-4 bg-card rounded-xl border border-border no-underline transition-colors hover:border-primary/30"
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {job.isUrgent && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-destructive text-white">
            급구
          </span>
        )}
        {job.region && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-muted text-foreground text-caption font-medium">
            📍 {job.region}
          </span>
        )}
        {job.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary-strong text-caption font-medium"
          >
            {tag}
          </span>
        ))}
      </div>

      <p className="text-body font-bold text-foreground m-0 mb-1">
        {job.title}
      </p>

      <p className="text-body text-primary-text m-0 mb-1 font-bold">
        {formatSalary(job.salary)}
      </p>

      {job.highlight && (
        <p className="text-body text-muted-foreground m-0 mb-2">
          {job.highlight}
        </p>
      )}

      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span className="flex items-center gap-1"><IconEye size={15} /> {job.viewCount}</span>
        <span>{formatTimeAgo(job.createdAt)}</span>
      </div>
    </Link>
  )
}
