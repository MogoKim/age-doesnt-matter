import Link from 'next/link'

interface Props {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

export default function PaginationBar({ currentPage, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  const btnBase = 'flex items-center justify-center w-[52px] h-[52px] rounded-xl text-base font-bold transition-colors'

  return (
    <nav aria-label="페이지 네비게이션" className="flex items-center justify-center gap-1 mt-6 pb-2 flex-wrap">
      {currentPage > 1 ? (
        <Link href={buildHref(currentPage - 1)} className={`${btnBase} border border-border text-foreground hover:border-primary/30`}>
          ←
        </Link>
      ) : (
        <span className={`${btnBase} border border-border text-muted-foreground/40`}>←</span>
      )}

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className={`${btnBase} text-muted-foreground`}>···</span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={`${btnBase} ${
              p === currentPage
                ? 'bg-primary text-white'
                : 'border border-border text-foreground hover:border-primary/30'
            }`}
          >
            {p}
          </Link>
        )
      )}

      {currentPage < totalPages ? (
        <Link href={buildHref(currentPage + 1)} className={`${btnBase} border border-border text-foreground hover:border-primary/30`}>
          →
        </Link>
      ) : (
        <span className={`${btnBase} border border-border text-muted-foreground/40`}>→</span>
      )}
    </nav>
  )
}
