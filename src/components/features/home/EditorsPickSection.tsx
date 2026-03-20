import Link from 'next/link'

interface EditorsPost {
  id: string
  title: string
  excerpt: string
  likeCount: number
  commentCount: number
  board: string
}

const MOCK_EDITORS: EditorsPost[] = [
  {
    id: '1',
    title: '남편이 퇴직하고 처음 해준 요리 이야기',
    excerpt: '가슴이 뭉클해서 눈물이 날 것 같았어요. 40년 동안 회사만 다니던 남편이 처음으로 부엌에 섰거든요.',
    likeCount: 45,
    commentCount: 23,
    board: 'stories',
  },
  {
    id: '2',
    title: '60대에 시작한 그림 일기, 1년의 기록',
    excerpt: '퇴직 후 무료해서 시작한 그림 일기가 어느덧 365장이 되었습니다. 매일의 소소한 행복을 그렸어요.',
    likeCount: 38,
    commentCount: 17,
    board: 'stories',
  },
]

export default function EditorsPickSection() {
  return (
    <section className="py-6 border-b-8 border-background lg:py-8 lg:border-b-0">
      <div className="flex items-center justify-between mb-4 px-4 lg:px-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-xl">⭐</span>
          에디터스 픽
        </h2>
      </div>
      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
        {MOCK_EDITORS.map((post) => (
          <Link
            href={`/community/${post.board}/${post.id}`}
            key={post.id}
            className="mx-4 lg:mx-0 bg-card rounded-xl overflow-hidden border border-border no-underline text-inherit block mb-3 last:mb-0 lg:mb-0 active:opacity-95 lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:hover:transition-all"
          >
            <div
              className="w-full h-40 bg-background"
              role="img"
              aria-label={post.title}
            />
            <div className="p-4">
              <span className="inline-flex items-center gap-1 h-6 px-2.5 bg-[#FF8C00] text-white rounded-md text-xs font-bold mb-2.5">⭐ PO 추천</span>
              <h3 className="text-base font-bold text-foreground leading-[1.5] mb-2 break-keep line-clamp-2">{post.title}</h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">{post.excerpt}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>❤️ {post.likeCount}</span>
                <span>💬 {post.commentCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
