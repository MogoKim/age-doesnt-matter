'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { togglePostLike, togglePostScrap, incrementShareCount } from '@/lib/actions/likes'
import { toggleGuestPostLike } from '@/lib/actions/guest-likes'
import { useToast } from '@/components/common/Toast'
import { shareToKakao, copyShareLink, KakaoUnavailableError, preloadKakaoSdk } from '@/lib/kakao-share'
import { logKakaoShareDebug, getKakaoRuntimeSnapshot } from '@/lib/kakao-share-debug'
import { gtmLike, gtmShare } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { IconHeart, IconBookmark, IconShare, IconFlag, IconKakao, IconCopy } from '@/components/icons'
const ReportModal = dynamic(() => import('./ReportModal'))
const LoginPromptModal = dynamic(() => import('@/components/features/auth/LoginPromptModal'))

interface ActionBarProps {
  postId: string
  title: string
  description: string
  likeCount: number
  isLiked: boolean
  isScrapped: boolean
  isLoggedIn?: boolean
}

export default function ActionBar({ postId, title, description, likeCount, isLiked: initialLiked, isScrapped: initialScrapped, isLoggedIn }: ActionBarProps) {
  const { toast } = useToast()
  const pathname = usePathname()
  const initialAuthKnown = typeof isLoggedIn === 'boolean'
  const [isLiked, setIsLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(likeCount)
  const [isScrapped, setIsScrapped] = useState(initialScrapped)
  const [resolvedIsLoggedIn, setResolvedIsLoggedIn] = useState(isLoggedIn ?? false)
  const [authChecked, setAuthChecked] = useState(initialAuthKnown)
  const [isPending, startTransition] = useTransition()
  const likePendingRef = useRef(false)
  const [showReport, setShowReport] = useState(false)
  const [heartAnimating, setHeartAnimating] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [loginPromptMessage, setLoginPromptMessage] = useState('')

  // 게시글 상세에 공유 버튼이 있으므로 SDK를 미리 로드 (클릭 시 동기 sendDefault 가능)
  useEffect(() => {
    preloadKakaoSdk()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPostState() {
      try {
        const res = await fetch(`/api/me/post-state?postId=${encodeURIComponent(postId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('post-state fetch failed')
        const state = await res.json() as { isLoggedIn: boolean; isLiked: boolean; isScrapped: boolean }
        if (cancelled) return
        setResolvedIsLoggedIn(state.isLoggedIn)
        setIsLiked(state.isLiked)
        setIsScrapped(state.isScrapped)
      } catch {
        if (cancelled) return
        setResolvedIsLoggedIn(false)
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    }

    void loadPostState()
    return () => { cancelled = true }
  }, [postId])

  const handleLike = useCallback(() => {
    if (!authChecked) {
      toast('잠시만요. 상태를 확인하고 있어요')
      return
    }

    if (!resolvedIsLoggedIn) {
      if (isLiked) {
        toast('이미 공감하셨어요')
        return
      }
      const prevLikes = likes
      setIsLiked(true)
      setLikes(prevLikes + 1)
      setHeartAnimating(true)
      setTimeout(() => setHeartAnimating(false), 350)

      startTransition(async () => {
        const result = await toggleGuestPostLike(postId)
        if (result.alreadyLiked) {
          setLikes(prevLikes)
          toast('이미 공감하셨어요')
        } else if (result.error) {
          setIsLiked(false)
          setLikes(prevLikes)
          toast(result.error, 'error')
        } else {
          gtmLike('post', postId)
          trackEvent('like', { content_type: 'post', content_id: postId })
          toast('공감했어요! 회원가입하면 더 많은 활동을 즐길 수 있어요')
        }
      })
      return
    }

    if (isPending || likePendingRef.current) return
    likePendingRef.current = true
    const prevLiked = isLiked
    const prevLikes = likes
    const willLike = !prevLiked
    setIsLiked(willLike)
    setLikes(willLike ? prevLikes + 1 : prevLikes - 1)
    if (willLike) {
      setHeartAnimating(true)
      setTimeout(() => setHeartAnimating(false), 350)
      gtmLike('post', postId)
      trackEvent('like', { content_type: 'post', content_id: postId })
    }

    startTransition(async () => {
      const result = await togglePostLike(postId)
      likePendingRef.current = false
      if (result.error) {
        setIsLiked(prevLiked)
        setLikes(prevLikes)
        toast(result.error, 'error')
      } else if (willLike) {
        toast('공감했어요 ❤️', 'success')
      }
    })
  }, [authChecked, resolvedIsLoggedIn, isPending, isLiked, likes, postId, toast])

  const handleScrap = useCallback(() => {
    if (!authChecked) {
      toast('잠시만요. 상태를 확인하고 있어요')
      return
    }

    if (!resolvedIsLoggedIn) {
      setLoginPromptMessage('이 글이 마음에 드셨나요? 스크랩하면 언제든 다시 찾아볼 수 있어요')
      setShowLoginPrompt(true)
      return
    }
    if (isPending) return
    const wasScrapped = isScrapped
    setIsScrapped(!wasScrapped)

    startTransition(async () => {
      try {
        const result = await togglePostScrap(postId)
        if (result.error) {
          setIsScrapped(wasScrapped)
          toast(result.error, 'error')
        } else {
          trackEvent('scrap', { content_type: 'post', content_id: postId, action: wasScrapped ? 'remove' : 'add' })
          toast(wasScrapped ? '스크랩을 취소했어요' : '스크랩했어요')
        }
      } catch {
        // 서버 action throw 시에도 UI 원복 + 에러 토스트 (무증상 실패 방지)
        setIsScrapped(wasScrapped)
        toast('스크랩 처리에 실패했어요. 잠시 후 다시 시도해 주세요', 'error')
      }
    })
  }, [authChecked, resolvedIsLoggedIn, isPending, isScrapped, postId, toast])

  const [showShareMenu, setShowShareMenu] = useState(false)

  async function handleKakaoShare(e: React.MouseEvent) {
    logKakaoShareDebug('SHARE_CLICK_KAKAO', {
      isTrusted: e.isTrusted,
      postId,
      ...getKakaoRuntimeSnapshot(),
    })
    try {
      await shareToKakao({ title, description, url: window.location.pathname })
      gtmShare('kakao', 'post', postId)
      trackEvent('share', { method: 'kakao', content_type: 'post', content_id: postId })
      void incrementShareCount(postId)
      setShowShareMenu(false)
    } catch (e) {
      if (e instanceof KakaoUnavailableError) {
        logKakaoShareDebug('TOAST_FALLBACK', { reason: e.reason, postId })
        gtmShare('copy_link', 'post', postId)
        trackEvent('share', { method: 'copy_link', content_type: 'post', content_id: postId })
        void incrementShareCount(postId)
        toast('카카오톡을 열 수 없어 링크를 복사했어요', 'success')
        setShowShareMenu(false)
      } else {
        toast('공유에 실패했어요', 'error')
      }
    }
  }

  async function handleCopyLink() {
    const ok = await copyShareLink(window.location.pathname)
    if (ok) {
      gtmShare('copy_link', 'post', postId)
      trackEvent('share', { method: 'copy_link', content_type: 'post', content_id: postId })
      void incrementShareCount(postId)
    }
    toast(ok ? '링크가 복사되었어요' : '링크 복사에 실패했어요', ok ? 'success' : 'error')
    setShowShareMenu(false)
  }

  const btnBase = 'action-btn flex items-center gap-2 min-h-[52px] min-w-[52px] px-4 py-2 bg-none border-none text-muted-foreground text-[17px] font-medium cursor-pointer rounded-xl justify-center hover:bg-primary/5 hover:text-primary-text'

  return (
    <>
      <div className="flex items-center justify-around bg-card border border-border rounded-2xl py-2 mb-8 shadow-sm">
        <button
          className={cn(btnBase, isLiked && 'text-primary-text font-bold')}
          onClick={handleLike}
          disabled={isPending || !authChecked}
          aria-label={isLiked ? '공감 취소' : '공감'}
        >
          <span className={cn(heartAnimating && 'heart-active')}>
            <IconHeart size={20} filled={isLiked} />
          </span>
          <span>공감{likes > 0 ? ` ${likes}` : ''}</span>
        </button>
        <button
          className={cn(btnBase, isScrapped && 'text-primary-text font-bold')}
          onClick={handleScrap}
          disabled={isPending || !authChecked}
          aria-label={isScrapped ? '스크랩 취소' : '스크랩'}
        >
          <IconBookmark size={20} filled={isScrapped} />
          <span>스크랩</span>
        </button>
        <div className="relative">
          <button className={btnBase} onClick={(e) => { if (!showShareMenu) logKakaoShareDebug('SHARE_MENU_OPEN', { isTrusted: e.isTrusted, postId }); setShowShareMenu(!showShareMenu) }} aria-label="공유">
            <IconShare size={20} />
            <span>공유</span>
          </button>
          {showShareMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg p-1 min-w-[140px]">
                <button
                  type="button"
                  onClick={handleKakaoShare}
                  className="action-btn flex items-center gap-2.5 w-full px-3 py-2.5 min-h-[52px] text-[17px] text-foreground font-medium rounded-lg hover:bg-primary/5 hover:text-primary-text"
                >
                  <IconKakao size={18} />
                  <span>카카오톡</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="action-btn flex items-center gap-2.5 w-full px-3 py-2.5 min-h-[52px] text-[17px] text-foreground font-medium rounded-lg hover:bg-primary/5 hover:text-primary-text"
                >
                  <IconCopy size={18} />
                  <span>링크 복사</span>
                </button>
              </div>
            </>
          )}
        </div>
        <button className={btnBase} onClick={() => setShowReport(true)} aria-label="신고">
          <IconFlag size={20} />
          <span>신고</span>
        </button>
      </div>

      {showReport && (
        <ReportModal
          targetId={postId}
          targetType="post"
          onClose={() => setShowReport(false)}
        />
      )}

      {showLoginPrompt && (
        <LoginPromptModal
          message={loginPromptMessage}
          callbackUrl={pathname}
          onClose={() => setShowLoginPrompt(false)}
        />
      )}
    </>
  )
}
