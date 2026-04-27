'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sendGtmEvent } from '@/lib/gtm'

type Post = {
  id: string
  title: string
  content: string
  author: string
  cafeName: string
  likeCount: number
  commentCount: number
  postedAt: Date
}

function SignupModal({ onClose, tParam }: { onClose: () => void; tParam: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full md:max-w-sm bg-white rounded-t-2xl md:rounded-2xl px-6 pt-8 pb-10 md:pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[19px] font-bold text-center mb-1" style={{ color: '#111' }}>
          공감하려면 가입이 필요해요
        </p>
        <p className="text-[15px] text-center mb-6" style={{ color: '#888' }}>
          나 같은 사람들이 기다리고 있어요
        </p>

        <Link
          href="/login?callbackUrl=/"
          className="flex items-center justify-center gap-2 w-full h-[52px] rounded-xl font-bold text-base"
          style={{ background: '#FEE500', color: '#191919' }}
          onClick={() => sendGtmEvent('landing_cta_click', { button: 'modal', t_param: tParam })}
        >
          <span className="text-[20px]">💬</span>
          카카오로 무료 가입
        </Link>

        <button
          onClick={onClose}
          className="w-full mt-3 h-[44px] text-sm rounded-xl"
          style={{ color: '#aaa' }}
        >
          닫기
        </button>
      </div>
    </div>
  )
}

function PostCard({ post, onAction }: { post: Post; onAction: (action: 'like' | 'comment') => void }) {
  const preview = post.content.length > 100
    ? post.content.slice(0, 100) + '...'
    : post.content

  return (
    <article className="bg-white rounded-2xl p-4 shadow-[0_1px_8px_rgba(0,0,0,0.07)]">
      {/* 닉네임 + 카페 뱃지 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[15px] font-semibold" style={{ color: '#333' }}>
          {post.author}
        </span>
        <span
          className="text-caption px-2 py-0.5 rounded-full font-medium"
          style={{ background: '#FFF0EE', color: '#FF6F61' }}
        >
          {post.cafeName}
        </span>
      </div>

      {/* 제목 */}
      <p className="text-[16px] font-bold leading-snug mb-1" style={{ color: '#111' }}>
        {post.title}
      </p>

      {/* 본문 앞 100자 */}
      <p className="text-caption leading-relaxed mb-3" style={{ color: '#666' }}>
        {preview}
      </p>

      {/* 공감/댓글 수 */}
      <div className="flex items-center gap-3 mb-3 text-caption" style={{ color: '#aaa' }}>
        <span>❤️ {post.likeCount.toLocaleString()}</span>
        <span>💬 {post.commentCount.toLocaleString()}</span>
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => onAction('like')}
          className="flex-1 h-[44px] rounded-xl text-[14px] font-semibold border transition-colors"
          style={{ borderColor: '#FF6F61', color: '#FF6F61' }}
        >
          공감하기
        </button>
        <button
          onClick={() => onAction('comment')}
          className="flex-1 h-[44px] rounded-xl text-[14px] font-semibold border transition-colors"
          style={{ borderColor: '#ddd', color: '#666' }}
        >
          댓글 달기
        </button>
      </div>
    </article>
  )
}

export default function LandingClient({ posts, t = 'relation' }: { posts: Post[]; t?: string }) {
  const [showModal, setShowModal] = useState(false)

  function handleCardAction(action: 'like' | 'comment') {
    sendGtmEvent('landing_card_action', { action, t_param: t })
    setShowModal(true)
  }

  return (
    <>
      {/* 인기글 카드 목록 */}
      <section className="px-4 pb-32 space-y-3 max-w-lg mx-auto w-full">
        {posts.length === 0 ? (
          <p className="text-center py-12 text-[15px]" style={{ color: '#aaa' }}>
            글을 불러오는 중이에요...
          </p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onAction={handleCardAction}
            />
          ))
        )}
      </section>

      {/* 스티키 하단 CTA 바 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.96)', borderTop: '1px solid #f0f0f0', backdropFilter: 'blur(8px)' }}
      >
        <div className="max-w-lg mx-auto">
          <Link
            href="/login?callbackUrl=/"
            className="flex items-center justify-center gap-2 w-full h-[52px] rounded-xl font-bold text-base shadow-sm"
            style={{ background: '#FEE500', color: '#191919' }}
            onClick={() => sendGtmEvent('landing_cta_click', { button: 'sticky_bar', t_param: t })}
          >
            <span className="text-[20px]">💬</span>
            카카오로 무료 가입하기
          </Link>
          <div className="flex items-center justify-center gap-4 mt-2 text-[12px]" style={{ color: '#aaa' }}>
            <span>✓ 닉네임만 공개</span>
            <span style={{ color: '#ddd' }}>|</span>
            <span>✓ 10초 가입 · 무료</span>
          </div>
        </div>
      </div>

      {/* 가입 유도 모달 */}
      {showModal && <SignupModal onClose={() => setShowModal(false)} tParam={t} />}
    </>
  )
}
