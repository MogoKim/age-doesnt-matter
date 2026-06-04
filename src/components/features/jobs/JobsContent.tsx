'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { JobCardItem } from '@/lib/queries/posts'
import type { SearchField } from '@/lib/queries/posts/posts.base'
import PostListWithAds from '@/components/features/common/PostListWithAds'
import BoardPaginationFooter from '@/components/features/common/BoardPaginationFooter'
import JobCard from '@/components/features/jobs/JobCard'

const LIMIT = 12

interface JobsContentProps {
  initialJobs: JobCardItem[]
  initialTotal: number
}

interface JobsResponse {
  jobs: JobCardItem[]
  total: number
}

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export default function JobsContent({ initialJobs, initialTotal }: JobsContentProps) {
  const searchParams = useSearchParams()
  const region = searchParams.get('region') || undefined
  const tags = searchParams.get('tags')?.split(',').filter(Boolean)
  const q = searchParams.get('q')?.trim() || undefined
  const sf = parseSearchField(searchParams.get('sf'))
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const hasFilters = !!region || !!(tags && tags.length > 0)
  const isDefaultView = !q && !hasFilters && page === 1

  const [data, setData] = useState<JobsResponse>({
    jobs: initialJobs,
    total: initialTotal,
  })
  const [isLoading, setIsLoading] = useState(false)

  const queryKey = useMemo(() => {
    const params = new URLSearchParams()
    if (region) params.set('region', region)
    if (tags && tags.length > 0) params.set('tags', tags.join(','))
    if (q) {
      params.set('q', q)
      params.set('sf', sf)
    }
    if (page > 1) params.set('page', String(page))
    return params.toString()
  }, [region, tags, q, sf, page])

  useEffect(() => {
    if (isDefaultView) {
      setData({ jobs: initialJobs, total: initialTotal })
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)

    fetch(`/api/jobs?${queryKey}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to fetch jobs: ${response.status}`)
        return response.json() as Promise<JobsResponse>
      })
      .then((nextData) => setData(nextData))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('[JobsContent] fetch failed', error)
      })
      .finally(() => setIsLoading(false))

    return () => controller.abort()
  }, [initialJobs, initialTotal, isDefaultView, queryKey])

  const regionSuffix = region ? `&region=${encodeURIComponent(region)}` : ''
  const tagsSuffix = tags && tags.length > 0 ? `&tags=${encodeURIComponent(tags.join(','))}` : ''
  const qSuffix = q ? `&q=${encodeURIComponent(q)}&sf=${sf}` : ''

  return (
    <>
      {hasFilters && (
        <div className="flex items-center gap-2 mb-4 text-body text-muted-foreground">
          <span className="font-medium">적용된 필터:</span>
          {region && (
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary-text text-caption font-medium">
              {region}
            </span>
          )}
          {tags?.map((tag) => (
            <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary-text text-caption font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : data.jobs.length > 0 ? (
        <PostListWithAds
          items={data.jobs}
          renderCard={(job) => <JobCard job={job} />}
          className="space-y-3"
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border">
          <p className="text-body text-muted-foreground leading-relaxed">
            {q ? (
              <>&ldquo;{q}&rdquo; 검색 결과가 없어요.<br />다른 검색어를 입력해 보세요.</>
            ) : hasFilters ? (
              <>조건에 맞는 일자리가 없어요.<br />필터를 변경해 보세요!</>
            ) : (
              <>아직 등록된 일자리가 없어요.<br />곧 새로운 일자리가 올라올 거예요!</>
            )}
          </p>
          {(q || hasFilters) && (
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center h-[52px] px-6 bg-primary text-white rounded-xl text-body font-bold no-underline hover:bg-primary/90"
            >
              {q ? '검색 초기화' : '필터 초기화'}
            </Link>
          )}
        </div>
      )}

      <BoardPaginationFooter
        total={data.total}
        page={page}
        pageSize={LIMIT}
        buildHref={(p) => `/jobs?page=${p}${regionSuffix}${tagsSuffix}${qSuffix}`}
      />
    </>
  )
}
