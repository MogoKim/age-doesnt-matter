const FALLBACK = 'bg-primary/10 text-primary-text'

const CHIP_MAP: Record<string, string> = {
  STORY:    'bg-[var(--cat-life-bg)] text-[var(--cat-life-text)]',
  HUMOR:    'bg-[var(--cat-laugh-bg)] text-[var(--cat-laugh-text)]',
  LIFE2:    'bg-[var(--cat-life2-bg)] text-[var(--cat-life2-text)]',
  // MENOPAUSE 누락 시 FALLBACK(코랄)로 떨어져 IconMenu(핑크)와 어긋나고 대비 3.10:1(작은 글씨 AA 미달)이 된다.
  // JOB은 --cat-job-bg 토큰이 없고 JOB 글에 category가 붙지 않아(job-scraper 미설정) 칩 렌더 경로 자체가 없음 → 의도적 제외.
  MENOPAUSE: 'bg-[var(--cat-meno-bg)] text-[var(--cat-meno-text)]',
  MAGAZINE: 'bg-[var(--cat-mag-bg)] text-[var(--cat-mag-text)]',
  WEEKLY:   'bg-[var(--cat-best-bg)] text-[var(--cat-best-text)]',
}

export function getCategoryChipClass(boardType: string): string {
  return CHIP_MAP[boardType] ?? FALLBACK
}
