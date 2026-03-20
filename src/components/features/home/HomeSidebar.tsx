import Link from 'next/link'

const MOCK_SIDEBAR_POSTS = [
  { id: '1', title: '오늘 날씨 좋아서 산책 다녀왔어요', board: 'stories' },
  { id: '2', title: '손주 돌잔치 사진 올려봅니다 ㅎㅎ', board: 'stories' },
  { id: '3', title: '요즘 웃긴 동영상 하나 공유할게요', board: 'humor' },
  { id: '4', title: '퇴직 후 텃밭 가꾸기 시작했는데 질문이요', board: 'stories' },
  { id: '5', title: '50대 후반인데 이직 고민 중입니다', board: 'stories' },
]

export default function HomeSidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-[92px]">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h3 className="text-base font-bold text-foreground mb-3 pb-2.5 border-b border-border">💬 최신 소통글</h3>
        <ul className="list-none m-0 p-0">
          {MOCK_SIDEBAR_POSTS.map((post) => (
            <li key={post.id}>
              <Link
                href={`/community/${post.board}/${post.id}`}
                className="block py-2.5 border-b border-border last:border-b-0 text-[15px] text-foreground leading-[1.4] whitespace-nowrap overflow-hidden text-ellipsis no-underline hover:text-primary"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-[#F9F5F0] rounded-xl p-4 border border-border relative min-h-[250px] flex items-center justify-center text-muted-foreground text-xs">
        <span className="absolute top-2 right-3 text-[11px] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border">광고</span>
        광고 영역
      </div>
    </aside>
  )
}
