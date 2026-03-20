import Link from 'next/link'

interface TrendingPost {
  id: string
  title: string
  commentCount: number
  likeCount: number
  board: string
  boardLabel: string
}

const MOCK_TRENDING: TrendingPost[] = [
  {
    id: '1',
    title: '퇴직 후 처음 카페에서 알바한 썰... 생각보다 재밌었어요',
    commentCount: 24,
    likeCount: 67,
    board: 'humor',
    boardLabel: '활력충전소',
  },
  {
    id: '2',
    title: '손주가 어제 처음 불렀어요 "할머니" 가슴이 뭉클해서...',
    commentCount: 12,
    likeCount: 34,
    board: 'stories',
    boardLabel: '사는이야기',
  },
  {
    id: '3',
    title: '기초연금 인상 소식, 이제 확정됐대요',
    commentCount: 8,
    likeCount: 29,
    board: 'magazine',
    boardLabel: '매거진',
  },
  {
    id: '4',
    title: '60살에 운전면허 따는 중인데 요즘 세상 좋아졌어요',
    commentCount: 31,
    likeCount: 52,
    board: 'humor',
    boardLabel: '활력충전소',
  },
  {
    id: '5',
    title: '은퇴 후 부부 여행 다녀온 후기 (제주도 3박4일)',
    commentCount: 15,
    likeCount: 41,
    board: 'stories',
    boardLabel: '사는이야기',
  },
]

export default function TrendingSection() {
  return (
    <section className="py-6 border-b-8 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">🔥</span>
          지금 뜨는 이야기
        </h2>
        <Link href="/best" className="text-[15px] text-muted-foreground no-underline flex items-center gap-1 p-2 -m-2 min-h-[44px] min-w-[44px] hover:text-primary">
          더보기 →
        </Link>
      </div>
      <ol className="list-none m-0 px-4 lg:px-0">
        {MOCK_TRENDING.map((post, index) => (
          <li key={post.id}>
            <Link
              href={`/community/${post.board}/${post.id}`}
              className="flex items-start gap-3 py-3.5 border-b border-border last:border-b-0 no-underline text-inherit min-h-[52px] active:bg-background active:-mx-4 active:px-4 lg:active:mx-0 lg:active:px-0"
            >
              <span className="text-base font-bold text-primary min-w-[24px] shrink-0 leading-[1.4]">{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-[1.5] line-clamp-2 mb-1.5 break-keep">{post.title}</p>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <span>💬 {post.commentCount}</span>
                  <span>❤️ {post.likeCount}</span>
                  <span className="bg-background px-2 py-0.5 rounded text-xs text-muted-foreground">{post.boardLabel}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
