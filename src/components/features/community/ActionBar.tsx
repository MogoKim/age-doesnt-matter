'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { togglePostLike, togglePostScrap, incrementShareCount } from '@/lib/actions/likes'
import { toggleGuestPostLike } from '@/lib/actions/guest-likes'
import { useToast } from '@/components/common/Toast'
import { shareToKakao, copyShareLink, KakaoUnavailableError, preloadKakaoSdk, buildPostShareUrl } from '@/lib/kakao-share'
import { logKakaoShareDebug, getKakaoRuntimeSnapshot } from '@/lib/kakao-share-debug'
import { gtmLike, gtmShare } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { IconHeart, IconBookmark, IconShare, IconFlag, IconKakao, IconCopy, IconMore } from '@/components/icons'
import BottomSheet from '@/components/ui/BottomSheet'
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
  /** 바 컨테이너 추가 클래스 (카드 안에 넣을 때 border/margin 조정용) */
  className?: string
}

export default function ActionBar({ postId, title, description, likeCount, isLiked: initialLiked, isScrapped: initialScrapped, isLoggedIn, className }: ActionBarProps) {
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
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  async function handleKakaoShare(e: React.MouseEvent) {
    logKakaoShareDebug('SHARE_CLICK_KAKAO', {
      isTrusted: e.isTrusted,
      postId,
      ...getKakaoRuntimeSnapshot(),
    })
    try {
      await shareToKakao({ title, description, url: buildPostShareUrl(window.location.pathname, postId) })
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

  return (
    <>
      <div className={cn('flex items-center gap-2 border-y border-border py-1.5 mb-6', className)}>
        {/* 공감 — 유일하게 강조되는 코랄 알약 */}
        <button
          className={cn(
            'action-btn flex items-center gap-2 h-11 px-4 rounded-full text-[17px] font-bold bg-primary/10 text-primary-text disabled:opacity-60',
            isLiked && 'bg-primary/[0.18] text-[#D84A3E]'
          )}
          onClick={handleLike}
          disabled={isPending || !authChecked}
          aria-label={isLiked ? '공감 취소' : '공감'}
        >
          <span className={cn(heartAnimating && 'heart-active')}>
            <IconHeart size={20} filled={isLiked} />
          </span>
          <span>공감{likes > 0 ? ` ${likes}` : ''}</span>
        </button>

        <div className="flex-1" />

        {/* 공유 — 보조 (기존 카카오/링크복사 popover 유지) */}
        <div className="relative">
          <button
            className="action-btn flex items-center gap-1.5 h-11 min-w-[44px] px-2 rounded-xl text-[17px] font-medium text-muted-foreground hover:text-primary-text"
            onClick={(e) => { if (!showShareMenu) logKakaoShareDebug('SHARE_MENU_OPEN', { isTrusted: e.isTrusted, postId }); setShowShareMenu(!showShareMenu) }}
            aria-label="공유"
            aria-haspopup="menu"
            aria-expanded={showShareMenu}
          >
            <IconShare size={20} />
            <span>공유</span>
          </button>
          {showShareMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg p-1 min-w-[150px]">
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

        {/* 더보기 — 스크랩·신고를 BottomSheet 안으로 */}
        <button
          className="action-btn flex items-center justify-center h-11 w-11 rounded-xl text-muted-foreground hover:text-primary-text"
          onClick={() => setShowMoreMenu(true)}
          aria-label="더보기"
          aria-haspopup="menu"
          aria-expanded={showMoreMenu}
        >
          <IconMore size={22} />
        </button>
      </div>

      <BottomSheet open={showMoreMenu} onClose={() => setShowMoreMenu(false)} title="더보기">
        <div className="flex flex-col">
          <button
            type="button"
            className="action-btn flex items-center gap-3.5 min-h-[52px] px-1 text-[17px] font-semibold text-foreground rounded-xl hover:bg-primary/5 disabled:opacity-60"
            onClick={() => { handleScrap(); setShowMoreMenu(false) }}
            disabled={isPending || !authChecked}
          >
            <IconBookmark size={22} filled={isScrapped} />
            <span>{isScrapped ? '스크랩 해제' : '스크랩'}</span>
          </button>
          <button
            type="button"
            className="action-btn flex items-center gap-3.5 min-h-[52px] px-1 text-[17px] font-semibold text-destructive rounded-xl hover:bg-destructive/5"
            onClick={() => { setShowReport(true); setShowMoreMenu(false) }}
          >
            <IconFlag size={22} />
            <span>신고</span>
          </button>
        </div>
      </BottomSheet>

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
