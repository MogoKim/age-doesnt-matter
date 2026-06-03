const FALLBACK = 'bg-primary/10 text-primary-text'

const CHIP_MAP: Record<string, string> = {
  STORY:    'bg-[var(--cat-life-bg)] text-[var(--cat-life-text)]',
  HUMOR:    'bg-[var(--cat-laugh-bg)] text-[var(--cat-laugh-text)]',
  LIFE2:    'bg-[var(--cat-life2-bg)] text-[var(--cat-life2-text)]',
  MAGAZINE: 'bg-[var(--cat-mag-bg)] text-[var(--cat-mag-text)]',
  WEEKLY:   'bg-[var(--cat-best-bg)] text-[var(--cat-best-text)]',
}

export function getCategoryChipClass(boardType: string): string {
  return CHIP_MAP[boardType] ?? FALLBACK
}
