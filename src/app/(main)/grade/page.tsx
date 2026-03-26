import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '회원 등급 안내',
  description: '우나어 회원 등급 시스템 — 새싹부터 따뜻한이웃까지',
}

const GRADES = [
  {
    emoji: '🌱',
    label: '새싹',
    description: '우나어에 처음 가입한 회원',
    condition: '회원가입 시 자동 부여',
    benefits: ['글 쓰기', '댓글 달기', '공감 누르기'],
    color: 'bg-green-50 border-green-200',
    emojiColor: 'text-green-600',
  },
  {
    emoji: '🌿',
    label: '단골',
    description: '활발하게 활동하는 회원',
    condition: '글 5개 이상 작성 또는 댓글 20개 이상',
    benefits: ['새싹 혜택 전부', '닉네임 옆 단골 배지'],
    color: 'bg-emerald-50 border-emerald-200',
    emojiColor: 'text-emerald-600',
  },
  {
    emoji: '💎',
    label: '터줏대감',
    description: '커뮤니티에 기여가 큰 회원',
    condition: '글 20개 이상 작성 + 받은 공감 100개 이상',
    benefits: ['단골 혜택 전부', '터줏대감 특별 배지', '에디터스 픽 우선 추천'],
    color: 'bg-blue-50 border-blue-200',
    emojiColor: 'text-blue-600',
  },
  {
    emoji: '☀️',
    label: '따뜻한이웃',
    description: '커뮤니티의 모범이 되는 특별 회원',
    condition: '운영진이 직접 선정 (자동 승급 아님)',
    benefits: ['터줏대감 혜택 전부', '따뜻한이웃 골드 배지', '커뮤니티 멘토 역할'],
    color: 'bg-amber-50 border-amber-200',
    emojiColor: 'text-amber-600',
  },
]

export default function GradePage() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-2xl font-bold text-foreground mb-2 leading-tight">
        회원 등급 안내
      </h1>
      <p className="text-base text-muted-foreground mb-8 leading-relaxed">
        우나어에서 활동하면 등급이 올라가요. 더 많이 참여할수록 좋은 혜택이!
      </p>

      {/* 등급 카드 */}
      <div className="space-y-4 mb-10">
        {GRADES.map((grade, index) => (
          <div
            key={grade.label}
            className={`p-5 rounded-2xl border-2 ${grade.color}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-3xl ${grade.emojiColor}`}>{grade.emoji}</span>
              <div>
                <h2 className="text-lg font-bold text-foreground m-0">{grade.label}</h2>
                <p className="text-[0.88rem] text-muted-foreground m-0">{grade.description}</p>
              </div>
            </div>

            <div className="bg-white/60 rounded-xl p-3 mb-3">
              <p className="text-[0.88rem] text-foreground m-0">
                <span className="font-bold text-primary">승급 조건:</span>{' '}
                {grade.condition}
              </p>
            </div>

            <div>
              <p className="text-[0.88rem] font-bold text-foreground mb-1.5">혜택</p>
              <ul className="list-none m-0 p-0 space-y-1">
                {grade.benefits.map((benefit) => (
                  <li key={benefit} className="text-[0.88rem] text-foreground flex items-start gap-2">
                    <span className="text-primary shrink-0">✓</span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {index < GRADES.length - 1 && (
              <div className="flex justify-center mt-4 text-muted-foreground text-xl">↓</div>
            )}
          </div>
        ))}
      </div>

      {/* 자주 묻는 질문 */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-foreground mb-4">자주 묻는 질문</h2>
        <div className="space-y-3">
          <FaqItem
            q="등급은 어떻게 올라가나요?"
            a="글과 댓글을 쓰면 자동으로 올라가요. 새싹에서 단골로는 글 5개 또는 댓글 20개면 됩니다."
          />
          <FaqItem
            q="등급이 내려가기도 하나요?"
            a="아니요, 한번 올라간 등급은 내려가지 않아요."
          />
          <FaqItem
            q="따뜻한이웃은 어떻게 되나요?"
            a="운영진이 커뮤니티에 기여가 큰 회원을 직접 선정합니다. 꾸준히 좋은 글을 쓰고 다른 회원에게 도움을 주면 기회가 와요!"
          />
        </div>
      </section>

      <div className="text-center">
        <Link
          href="/community/stories"
          className="inline-flex items-center gap-1.5 h-[52px] px-6 bg-primary text-white rounded-xl text-base font-bold no-underline hover:bg-[#E85D50]"
        >
          지금 글 쓰러 가기 →
        </Link>
      </div>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="p-4 bg-card rounded-xl border border-border">
      <p className="text-base font-bold text-foreground mb-1 m-0">Q. {q}</p>
      <p className="text-[0.88rem] text-muted-foreground m-0 leading-relaxed">{a}</p>
    </div>
  )
}
