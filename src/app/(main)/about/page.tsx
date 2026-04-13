import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { FaqAccordion } from '@/components/common/FaqAccordion'
import type { FaqItem } from '@/components/common/FaqAccordion'

export const metadata: Metadata = {
  title: '우나어 소개',
  description: '아이들은 크고, 내 이야기 들어줄 사람이 없어지는 그 조용함을 깨러 만든 50·60대 공간',
  alternates: { canonical: 'https://age-doesnt-matter.com/about' },
}

const VALUE_CARDS = [
  {
    emoji: '💬',
    title: '내 이야기에 댓글이 달릴 때의 그 따뜻함',
    desc: '비슷한 나이, 비슷한 마음 — 혼자가 아니라는 걸 느끼게 해줘요',
    href: '/community/stories',
    label: '사는이야기',
  },
  {
    emoji: '🌱',
    title: '비슷한 처지의 사람을 만났을 때의 그 안도감',
    desc: '인생 2막 먼저 간 사람, 지금 준비 중인 사람이 다 여기 있어요',
    href: '/community/life2',
    label: '2막준비',
  },
  {
    emoji: '😄',
    title: '글 하나에 하루가 밝아지는 그 순간',
    desc: '우리 또래만 아는 유머, 오늘도 한번 웃어봐요',
    href: '/community/humor',
    label: '웃음방',
  },
  {
    emoji: '📖',
    title: '몰랐던 걸 알게 됐을 때의 그 시원함',
    desc: '기초연금, 재취업, 건강 — 우리 나이에 맞는 정보만 골라드려요',
    href: '/magazine',
    label: '매거진',
  },
] as const

const FAQ_GROUPS: Array<{ group: string; items: FaqItem[] }> = [
  {
    group: '가입 / 계정',
    items: [
      {
        q: '가입은 어떻게 하나요?',
        a: (
          <span>
            카카오 계정으로 30초면 가입돼요.{' '}
            <Link href="/login?callbackUrl=/community/stories" className="text-primary font-bold underline">
              카카오로 시작하기 →
            </Link>
          </span>
        ),
      },
      {
        q: '가입비가 있나요?',
        a: '완전 무료입니다. 별도 결제 없이 모든 기능을 이용할 수 있어요.',
      },
    ],
  },
  {
    group: '글쓰기 / 댓글',
    items: [
      {
        q: '글은 어떻게 써요?',
        a: (
          <div className="space-y-2">
            <p>원하는 게시판에 들어간 뒤 오른쪽 아래 ✏️ 버튼을 눌러주세요.</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><Link href="/community/stories" className="text-primary underline">사는이야기</Link> — 일상·고민·감동 이야기</li>
              <li><Link href="/community/life2" className="text-primary underline">2막준비</Link> — 재취업·은퇴·인생 2막</li>
              <li><Link href="/community/humor" className="text-primary underline">웃음방</Link> — 유머·재미있는 글</li>
            </ul>
            <p className="text-sm text-muted-foreground">✏️ 버튼은 로그인 후에 보여요.</p>
          </div>
        ),
      },
      {
        q: '댓글은 누구나 볼 수 있나요?',
        a: '네, 회원 누구나 볼 수 있어요. 비회원은 읽기만 가능합니다.',
      },
    ],
  },
  {
    group: '개인정보 / 보안',
    items: [
      {
        q: '내 정보가 공개되나요?',
        a: '닉네임만 공개됩니다. 실명·전화번호·카카오 정보는 절대 공개 안 돼요.',
      },
    ],
  },
]

export default async function AboutPage() {
  const session = await auth()
  const isLoggedIn = !!session

  return (
    <div className="max-w-[720px] mx-auto">
      {/* 섹션 0 — 페이지 헤더 */}
      <section className="px-4 pt-10 pb-6 md:px-6">
        <h1 className="text-2xl font-bold text-foreground mb-1.5">우리 나이가 어때서</h1>
        <p className="text-body text-muted-foreground">비슷한 나이, 비슷한 마음이 모이는 곳</p>
      </section>

      {/* 섹션 1 — 감성 훅 */}
      <section className="px-4 pb-10 md:px-6">
        <div className="bg-primary/5 rounded-2xl p-6 md:p-8">
          <p className="text-body text-foreground leading-[2] break-keep">
            아이들은 크고, 남편과 점차 멀어지고, 친구들은 하나둘 연락이 뜸해지고<br />
            몸도 예전 같지 않다.
          </p>
          <p className="text-body text-foreground leading-[2] break-keep mt-4">
            그러다 어느 날 문득 깨닫는다.<br />
            내 이야기 들어줄 사람이 없다는 걸.
          </p>
          <p className="text-body text-foreground leading-[2] break-keep mt-6 font-bold">
            우리 나이가 어때서는<br />
            비슷한 나이, 비슷한 고민을 가진 사람들이<br />
            눈치 없이 꺼낼 수 있는 곳으로.
          </p>
          <div className="mt-6 pt-5 border-t border-primary/10">
            <Link
              href={isLoggedIn ? '/community/stories' : '/login?callbackUrl=/community/stories'}
              className="text-primary font-bold text-body no-underline hover:underline"
            >
              {isLoggedIn ? '커뮤니티 들어가기 →' : '30초면 시작돼요 →'}
            </Link>
          </div>
        </div>
      </section>

      {/* 섹션 2 — 경험 감성 카드 */}
      <section className="px-4 pb-10 md:px-6">
        <h2 className="text-xl font-bold text-foreground mb-5">우나어에서 생기는 일들</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {VALUE_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="flex flex-col gap-3 p-5 bg-card rounded-2xl border border-border no-underline hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{card.emoji}</span>
                <span className="text-caption text-primary font-bold bg-primary/10 rounded-full px-2.5 py-0.5">
                  {card.label}
                </span>
              </div>
              <p className="text-body font-bold text-foreground leading-snug break-keep m-0">
                {card.title}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed break-keep m-0">
                {card.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 섹션 3 — 가입 유도 */}
      <section className="px-4 pb-10 md:px-6">
        <div className="bg-primary/5 rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-bold text-foreground mb-4">걱정하지 마세요</h2>
          <ul className="space-y-3 mb-6 list-none pl-0">
            {[
              '닉네임만 공개 — 실명·연락처는 절대 공개 안 됩니다',
              '언제든 탈퇴 가능 — 가입비도, 약정도 없어요',
              '30초면 끝 — 카카오 계정 하나면 바로 시작',
            ].map((text) => (
              <li key={text} className="flex items-start gap-3 text-body text-foreground">
                <span className="text-primary font-bold shrink-0 mt-0.5">✓</span>
                <span className="break-keep">{text}</span>
              </li>
            ))}
          </ul>
          {isLoggedIn ? (
            <Link
              href="/community/stories"
              className="inline-flex items-center justify-center w-full h-[52px] bg-primary text-white rounded-xl text-body font-bold no-underline transition-colors hover:bg-[#E85D50] lg:w-auto lg:px-10"
            >
              커뮤니티 바로 가기
            </Link>
          ) : (
            <Link
              href="/login?callbackUrl=/community/stories"
              className="inline-flex items-center justify-center w-full h-[52px] bg-primary text-white rounded-xl text-body font-bold no-underline transition-colors hover:bg-[#E85D50] lg:w-auto lg:px-10"
            >
              카카오로 시작하기
            </Link>
          )}
        </div>
      </section>

      {/* 섹션 4 — FAQ */}
      <section className="px-4 pb-14 md:px-6">
        <h2 className="text-xl font-bold text-foreground mb-5">자주 묻는 질문</h2>
        <div className="space-y-7">
          {FAQ_GROUPS.map((group) => (
            <div key={group.group}>
              <h3 className="text-sm font-bold text-muted-foreground mb-3">{group.group}</h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <FaqAccordion key={item.q} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/faq" className="text-sm text-primary no-underline font-medium hover:underline">
            더 많은 질문 보기 →
          </Link>
        </div>
      </section>
    </div>
  )
}
