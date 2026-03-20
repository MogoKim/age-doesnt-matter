import Link from 'next/link'

interface MagazineArticle {
  id: string
  title: string
  category: string
}

const MOCK_MAGAZINE: MagazineArticle[] = [
  {
    id: '1',
    title: '60대 건강검진, 꼭 챙겨야 할 5가지',
    category: '건강',
  },
  {
    id: '2',
    title: '퇴직연금 수령 시 세금 줄이는 방법',
    category: '재테크',
  },
  {
    id: '3',
    title: '봄맞이 근교 나들이 추천 코스 7선',
    category: '여행',
  },
  {
    id: '4',
    title: '스마트폰 사기 피하는 법, 어르신 필독',
    category: '생활정보',
  },
]

export default function MagazineSection() {
  return (
    <section className="py-6 border-b-8 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">📖</span>
          매거진
        </h2>
        <Link href="/magazine" className="text-[15px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[44px] min-w-[44px] hover:text-primary">
          전체보기 →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:gap-4 lg:px-0">
        {MOCK_MAGAZINE.map((article) => (
          <Link
            href={`/magazine/${article.id}`}
            key={article.id}
            className="bg-card rounded-xl overflow-hidden border border-border no-underline text-inherit block active:opacity-95 lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div
              className="w-full h-[100px] lg:h-[140px] bg-background"
              role="img"
              aria-label={article.title}
            />
            <div className="p-3">
              <span className="text-xs text-primary font-semibold mb-1 block">{article.category}</span>
              <h3 className="text-[15px] font-bold text-foreground leading-[1.4] line-clamp-2 break-keep">{article.title}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
