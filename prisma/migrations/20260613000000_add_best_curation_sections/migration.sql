-- 베스트 페이지 큐레이션: HomeCurationSection enum에 BEST_HOT / BEST_FAME 추가
-- (어드민 "베스트 편성" 탭에서 /best 뜨는이야기·명예의전당 고정/숨김/순서 통제용)

ALTER TYPE "HomeCurationSection" ADD VALUE IF NOT EXISTS 'BEST_HOT';
ALTER TYPE "HomeCurationSection" ADD VALUE IF NOT EXISTS 'BEST_FAME';
