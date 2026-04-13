'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { Node, Extension, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 20 * 1024 * 1024  // 20MB (Presigned URL로 Vercel 우회 → R2 직접 업로드)
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB

// ─── 인라인 텍스트 크기 Extension ───
const FontSizeExtension = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }]
  },
})

// ─── 동영상 Node Extension ───
const VideoExtension = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  addAttributes() {
    return { src: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'video[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(
      { controls: true, class: 'w-full rounded-xl my-3 max-h-[400px]' },
      HTMLAttributes,
    )]
  },
})

const FONT_SIZES = [
  { label: '가', size: null,   title: '기본' },
  { label: '가', size: '22px', title: '크게' },
  { label: '가', size: '28px', title: '최대' },
] as const

// ─── 이미지 blob URL → CDN URL 교체 (업로드 완료 후, 히스토리 제외) ───
function replaceImageSrc(editor: Editor, oldSrc: string, newSrc: string) {
  const { state } = editor.view
  const tr = state.tr.setMeta('addToHistory', false)
  let replaced = false
  state.doc.descendants((node, pos) => {
    if (!replaced && node.type.name === 'image' && node.attrs.src === oldSrc) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: newSrc })
      replaced = true
    }
  })
  if (replaced) editor.view.dispatch(tr)
}

// ─── 이미지 노드 삭제 (업로드 실패 시 blob 플레이스홀더 제거) ───
function removeImageNode(editor: Editor, src: string) {
  const { state } = editor.view
  const tr = state.tr.setMeta('addToHistory', false)
  let deleted = false
  state.doc.descendants((node, pos) => {
    if (!deleted && node.type.name === 'image' && node.attrs.src === src) {
      tr.delete(pos, pos + node.nodeSize)
      deleted = true
    }
  })
  if (deleted) editor.view.dispatch(tr)
}

type VideoSheet = 'closed' | 'picking' | 'youtube'

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function TipTapEditor({
  content,
  onChange,
  placeholder = '내용을 입력해 주세요 (10자 이상)',
}: TipTapEditorProps) {
  const [videoSheet, setVideoSheet] = useState<VideoSheet>('closed')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeError, setYoutubeError] = useState('')
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [mediaError, setMediaError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  // paste handler에서 editor에 접근하기 위한 ref
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        code: false,
      }),
      TextStyle,
      FontSizeExtension,
      VideoExtension,
      Image.configure({
        HTMLAttributes: { class: 'rounded-xl max-w-full h-auto my-3' },
      }),
      Youtube.configure({
        width: 0,
        height: 0,
        HTMLAttributes: { class: 'aspect-video w-full rounded-xl overflow-hidden my-3' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-lg max-w-none min-h-[280px] p-4 text-body leading-[1.85] text-foreground outline-none focus:outline-none [word-break:keep-all]',
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        const trimmed = text.trim()
        // 유튜브 URL만 붙여넣기하면 자동 임베드
        const isOnlyYoutubeUrl =
          /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[^\s]+$/.test(trimmed)
        if (isOnlyYoutubeUrl) {
          editorRef.current?.chain().focus()
            .setYoutubeVideo({ src: trimmed })
            .createParagraphNear()
            .run()
          editorRef.current?.commands.scrollIntoView()
          return true
        }
        return false
      },
    },
  })

  // paste handler에서 사용하는 editorRef 갱신
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // 외부 content 변경 시 에디터 동기화 (임시저장 복원용)
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // ─── 사진 인라인 삽입 핸들러 ───
  // 즉시 blob URL로 프리뷰 삽입 → 병렬 R2 업로드 → CDN URL로 교체 (Vercel 완전 우회)
  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0 || !editor) return

      // HEIC 체크 (iOS 드물게 발생)
      const heicFile = files.find((f) => f.type === 'image/heic' || f.type === 'image/heif')
      if (heicFile) {
        setMediaError('HEIC 형식은 지원하지 않아요. iOS 설정 → 카메라 → 포맷 → 호환성 우선으로 변경해 주세요.')
        e.target.value = ''
        return
      }

      // 크기 초과 파일 체크
      const oversized = files.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversized.length > 0) {
        setMediaError('20MB를 넘는 사진은 추가할 수 없어요')
        e.target.value = ''
        return
      }

      setIsUploadingImage(true)
      setMediaError('')
      try {
        // 각 파일 병렬 처리: 즉시 로컬 프리뷰 삽입 → 백그라운드 업로드 → URL 교체
        await Promise.all(files.map(async (file) => {
          const mimeType = file.type || 'image/jpeg'

          // 1. 즉시 blob URL로 프리뷰 삽입 (업로드 완료 전 사용자가 바로 볼 수 있음)
          const blobUrl = URL.createObjectURL(file)
          editor.chain().focus().setImage({ src: blobUrl }).createParagraphNear().run()
          editor.commands.scrollIntoView()

          try {
            // 2. Presigned URL 발급
            const presignRes = await fetch(`/api/uploads/presign?type=${encodeURIComponent(mimeType)}`)
            if (!presignRes.ok) {
              const err = await presignRes.json().catch(() => ({}))
              setMediaError(`${err.error || '이미지 업로드 준비에 실패했어요'} (${presignRes.status})`)
              console.error('[upload/image] presign 실패:', presignRes.status, err)
              removeImageNode(editor, blobUrl)
              URL.revokeObjectURL(blobUrl)
              return
            }
            const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string }

            // 3. R2에 직접 PUT 업로드
            const uploadRes = await fetch(uploadUrl, {
              method: 'PUT',
              body: file,
              headers: { 'Content-Type': mimeType },
            })
            if (!uploadRes.ok) {
              setMediaError(`이미지 업로드에 실패했어요 (${uploadRes.status})`)
              console.error('[upload/image] R2 PUT 실패:', uploadRes.status)
              removeImageNode(editor, blobUrl)
              URL.revokeObjectURL(blobUrl)
              return
            }

            // 4. blob URL → CDN URL로 교체 (/_next/image 프록시, R2 직접 접근 우회)
            const proxiedSrc = `/_next/image?url=${encodeURIComponent(publicUrl)}&w=750&q=80`
            replaceImageSrc(editor, blobUrl, proxiedSrc)
            URL.revokeObjectURL(blobUrl)
          } catch (err) {
            removeImageNode(editor, blobUrl)
            URL.revokeObjectURL(blobUrl)
            throw err
          }
        }))
      } catch (err) {
        setMediaError(`이미지 업로드에 실패했어요: ${String(err).slice(0, 80)}`)
        console.error('[upload/image] 예외:', err)
      } finally {
        setIsUploadingImage(false)
        e.target.value = ''
      }
    },
    [editor],
  )

  // ─── 동영상 직접 업로드 핸들러 (Pre-signed URL → R2 직접 업로드, Vercel 4.5MB 제한 우회) ───
  const handleVideoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !editor) return

      if (file.size > MAX_VIDEO_SIZE) {
        setMediaError('동영상은 최대 50MB까지 업로드할 수 있어요')
        e.target.value = ''
        return
      }

      setIsUploadingVideo(true)
      setMediaError('')
      setVideoSheet('closed')

      try {
        // 1. Presigned URL 발급
        const ext = file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4'
        const presignRes = await fetch(`/api/uploads/video/presign?ext=${ext}`)
        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}))
          setMediaError(`${err.error || '동영상 업로드 준비에 실패했어요'} (${presignRes.status})`)
          return
        }
        const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string }

        // 2. R2에 직접 PUT 업로드
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!uploadRes.ok) {
          setMediaError(`동영상 업로드에 실패했어요 (${uploadRes.status})`)
          console.error('[upload/video] R2 직접 업로드 실패:', uploadRes.status)
          return
        }

        // 3. 에디터에 삽입 + 커서 위치로 스크롤
        editor.chain()
          .focus()
          .insertContent({ type: 'video', attrs: { src: publicUrl } })
          .createParagraphNear()
          .run()
        editor.commands.scrollIntoView()
      } catch {
        setMediaError('동영상 업로드에 실패했어요')
      } finally {
        setIsUploadingVideo(false)
        e.target.value = ''
      }
    },
    [editor],
  )

  // ─── 유튜브 삽입 핸들러 ───
  const handleYouTubeInsert = useCallback(() => {
    if (!editor) return
    const isValid = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/.test(youtubeUrl)
    if (!isValid) {
      setYoutubeError('올바른 유튜브 주소를 입력해 주세요')
      return
    }
    editor.chain()
      .focus()
      .setYoutubeVideo({ src: youtubeUrl })
      .createParagraphNear()
      .run()
    editor.commands.scrollIntoView()
    setYoutubeUrl('')
    setYoutubeError('')
    setVideoSheet('closed')
  }, [editor, youtubeUrl])

  if (!editor) return null

  const isUploading = isUploadingImage || isUploadingVideo

  return (
    <div className="relative">
      {/* ── sticky 툴바 (1행) ── */}
      {/* top: 모바일 Header(56) + IconMenu(64) + WriteHeader(52) = 172px / 데스크탑 GNB(64) + WriteHeader(52) = 116px */}
      <div className="sticky top-[172px] lg:top-[116px] z-20 bg-card pt-1 pb-2">
        <div className="flex items-center gap-0.5 border border-border rounded-xl bg-card px-2 py-1">
          {/* 인용구 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-body transition-colors',
              editor.isActive('blockquote') ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
            )}
          >
            "
          </button>

          {/* 굵게 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-body font-bold transition-colors',
              editor.isActive('bold') ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
            )}
          >
            B
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* 글자 크기 */}
          {FONT_SIZES.map(({ label, size, title }) => {
            const isActive = size !== null && editor.isActive('textStyle', { fontSize: size })
            return (
              <button
                key={title}
                type="button"
                title={title}
                onClick={() => {
                  if (size === null) {
                    editor.chain().focus().unsetMark('textStyle').run()
                  } else {
                    editor.chain().focus().setMark('textStyle', { fontSize: size }).run()
                  }
                }}
                className={cn(
                  'flex items-center justify-center min-h-[44px] min-w-[36px] rounded-xl transition-colors font-medium',
                  isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                )}
                style={{ fontSize: size ?? '15px' }}
              >
                {label}
              </button>
            )
          })}

          <div className="w-px h-6 bg-border mx-1" />

          {/* 사진 추가 */}
          <button
            type="button"
            onClick={() => { setMediaError(''); fileInputRef.current?.click() }}
            disabled={isUploadingImage}
            title="사진 추가"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-xl transition-colors text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isUploadingImage ? '⏳' : '📷'}
          </button>

          {/* 동영상 추가 */}
          <button
            type="button"
            onClick={() => { setMediaError(''); setVideoSheet('picking') }}
            disabled={isUploadingVideo}
            title="동영상 추가"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-xl transition-colors text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isUploadingVideo ? '⏳' : '🎬'}
          </button>
        </div>
      </div>

      {/* ── 미디어 에러 토스트 (fixed: 스크롤·키보드 무관하게 항상 화면에 표시) ── */}
      {mediaError && (
        <div className="fixed top-[132px] left-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive text-white shadow-xl">
          <span className="text-base shrink-0">⚠️</span>
          <span className="text-sm font-medium flex-1">{mediaError}</span>
          <button
            type="button"
            onClick={() => setMediaError('')}
            className="text-white/80 hover:text-white text-xl leading-none shrink-0 ml-1"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      )}

      {/* ── 3. 에디터 본문 ── */}
      <div
        className="border-2 border-border rounded-xl bg-card transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(255,111,97,0.1)]"
      >
        <EditorContent editor={editor} />
      </div>

      {/* ── 동영상 선택 바텀시트 ── */}
      {videoSheet !== 'closed' && (
        <div className="fixed inset-0 z-[60]" onClick={() => setVideoSheet('closed')}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl p-5 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {videoSheet === 'picking' ? (
              <>
                <p className="text-body font-bold text-foreground mb-4">동영상 추가 방법을 선택해 주세요</p>
                <div className="space-y-2">
                  {/* 1번: 내 동영상 올리기 (순서 변경) */}
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl border-2 border-border bg-background text-body font-medium text-foreground text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="text-2xl">🎞</span>
                    <div>
                      <p className="font-bold">내 동영상 올리기</p>
                      <p className="text-caption text-muted-foreground">MP4, MOV, WebM · 최대 50MB</p>
                    </div>
                  </button>
                  {/* 2번: 유튜브 링크 */}
                  <button
                    type="button"
                    onClick={() => setVideoSheet('youtube')}
                    className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl border-2 border-border bg-background text-body font-medium text-foreground text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="text-2xl">📺</span>
                    <div>
                      <p className="font-bold">유튜브 링크</p>
                      <p className="text-caption text-muted-foreground">유튜브 주소를 붙여넣어 삽입</p>
                    </div>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setVideoSheet('closed')}
                  className="w-full min-h-[52px] mt-3 border-2 border-border rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  취소
                </button>
              </>
            ) : (
              <>
                <p className="text-body font-bold text-foreground mb-2">유튜브 주소를 붙여넣어 주세요</p>
                <p className="text-caption text-muted-foreground mb-3">
                  💡 본문에 유튜브 링크를 바로 붙여넣기해도 자동으로 삽입돼요
                </p>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setYoutubeError('') }}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full min-h-[52px] px-4 border-2 border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleYouTubeInsert() }
                  }}
                  autoFocus
                />
                {youtubeError && <p className="text-sm text-destructive mt-1">{youtubeError}</p>}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => { setVideoSheet('picking'); setYoutubeUrl(''); setYoutubeError('') }}
                    className="min-h-[52px] px-5 border-2 border-border rounded-xl text-sm font-bold text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                  >
                    ← 뒤로
                  </button>
                  <button
                    type="button"
                    onClick={handleYouTubeInsert}
                    className="flex-1 min-h-[52px] bg-primary text-white rounded-xl text-sm font-bold hover:bg-[#E85D50] transition-colors"
                  >
                    삽입
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageFileChange}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handleVideoFileChange}
      />

      {/* TipTap 기본 스타일 */}
      <style jsx global>{`
        .tiptap p.is-editor-empty:first-child::before {
          color: var(--muted-foreground, #9ca3af);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap {
          word-break: keep-all;
          line-height: 1.85;
          caret-color: #FF6F61;
        }
        .tiptap p {
          margin: 0.5em 0;
        }
        .tiptap blockquote {
          border-left: 4px solid #FF6F61;
          padding: 0.5rem 1rem;
          margin: 1rem 0;
          background: rgba(255, 111, 97, 0.06);
          border-radius: 0 0.5rem 0.5rem 0;
          color: var(--muted-foreground);
        }
        .tiptap hr {
          border: none;
          border-top: 2px solid var(--border, #e5e7eb);
          margin: 1.5em 0;
        }
        .tiptap img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          margin: 0.75em 0;
        }
        .tiptap video {
          max-width: 100%;
          border-radius: 12px;
          margin: 0.75em 0;
        }
        .tiptap div[data-youtube-video] {
          margin: 0.75em 0;
        }
        .tiptap div[data-youtube-video] iframe {
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 12px;
        }
      `}</style>

      {/* 업로드 중 오버레이 (전체 에디터 블로킹) */}
      {isUploading && (
        <div className="absolute inset-0 bg-card/60 rounded-xl flex items-center justify-center z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2 shadow-md">
            <span className="text-lg">⏳</span>
            <span className="text-caption font-medium text-foreground">
              {isUploadingImage ? '사진 업로드 중...' : '동영상 업로드 중...'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
