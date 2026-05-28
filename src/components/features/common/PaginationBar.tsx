import Link from 'next/link'

interface Props {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

function getPageItems(current: number, total: number): (number | '...')[] {
  if (total <= 4) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const shown = new Set([1, current, total])
  if (current === 1) shown.add(2)
  if (current === total) shown.add(total - 1)

  const sorted = Array.from(shown).sort((a, b) => a - b)
  const result: (number | '...')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('...')
    }
    result.push(sorted[i])
  }
  return result
}

export default function PaginationBar({ currentPage, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null

  const items = getPageItems(currentPage, totalPages)
  const btnBase = 'flex items-center justify-center w-[52px] h-[52px] rounded-xl text-base font-bold transition-colors'

  return (
    <nav aria-label="페이지 네비게이션" className="flex items-center justify-center gap-0.5 mt-6 pb-2">
      {currentPage > 1 ? (
        <Link href={buildHref(currentPage - 1)} className={`${btnBase} border border-border text-foreground hover:border-primary/30`}>
          ←
        </Link>
      ) : (
        <span className={`${btnBase} border border-border text-muted-foreground/40`}>←</span>
      )}

      {items.map((p, i) =>
        p === '...' ? (
          <span
            key={`ellipsis-${i}`}
            aria-hidden="true"
            className="w-8 h-[52px] flex items-center justify-center text-caption text-muted-foreground"
          >
            ···
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={`${btnBase} ${
              p === currentPage
                ? 'bg-primary text-white border border-primary font-bold'
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
