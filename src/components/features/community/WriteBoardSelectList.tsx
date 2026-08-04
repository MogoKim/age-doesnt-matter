import Link from 'next/link'
import type { WriteBoardMeta } from '@/lib/write-boards'

export interface WriteBoardItem extends WriteBoardMeta {
  /** 이 게시판의 대표 카테고리 — 없으면 칩 줄을 그리지 않는다 */
  chips: string[]
}

/**
 * 게시판 선택 목록 (표현 전용).
 *
 * 데이터 조회는 페이지가 하고 여기는 그리기만 한다 — 화면 검증을 데이터 없이 할 수 있고,
 * 나중에 글쓰기 폼 안에서 같은 목록을 쓸 때(PR-3) 그대로 가져다 쓸 수 있다.
 *
 * 글씨 크기는 px가 아니라 --text-* 토큰을 inline style로 준다.
 * 프로젝트 규칙상 cn() 안에서 text-body/text-caption 유틸을 쓰면 tailwind-merge가
 * 색 클래스로 오인해 지워버리므로, IconMenu와 같은 방식(inline style)으로 맞춘다.
 */
export default function WriteBoardSelectList({ items }: { items: WriteBoardItem[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item) => {
        const Icon = item.Icon
        return (
          <li key={item.slug}>
            <Link
              href={`/community/write?board=${item.slug}`}
              aria-label={`${item.displayName}에 글쓰기`}
              className="flex min-h-[52px] items-center gap-3.5 border-b border-border px-5 py-3.5 no-underline transition-colors hover:bg-muted active:bg-muted [-webkit-tap-highlight-color:transparent]"
            >
              {/* 아이콘 타일 — 색은 IconMenu와 같은 CSS 변수에서 온다(새 hex 없음) */}
              <span
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[13px]"
                style={{ background: `var(${item.bgVar})`, color: `var(${item.strokeVar})` }}
              >
                <Icon size={24} />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block font-extrabold text-foreground break-keep"
                  style={{ fontSize: 'var(--text-body)' }}
                >
                  {item.displayName}
                </span>

                {/* 대표 칩 — 클릭 대상이 아니다(항목 전체가 Link).
                    글씨를 키우면 줄바꿈되게 두고, 대신 항목 높이가 같이 늘어난다. */}
                {item.chips.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {item.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-[5px] bg-muted px-[7px] py-[2px] font-semibold text-muted-foreground break-keep"
                        style={{ fontSize: 'var(--text-caption)' }}
                      >
                        {chip}
                      </span>
                    ))}
                  </span>
                )}
              </span>

              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted-foreground/60"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
