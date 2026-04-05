'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { Node, Extension, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 5 * 1024 * 1024   // 5MB
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

  // ─── 사진 인라인 삽입 핸들러 (A안: 즉시 업로드 → 커서 위치 삽입) ───
  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0 || !editor) return

      // 크기 초과 파일 체크
      const oversized = files.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversized.length > 0) {
        setMediaError('5MB를 넘는 사진은 추가할 수 없어요')
        e.target.value = ''
        return
      }

      setIsUploadingImage(true)
      setMediaError('')
      try {
        const uploadData = new FormData()
        files.forEach((f) => uploadData.append('files', f))
        const res = await fetch('/api/uploads', { method: 'POST', body: uploadData })
        if (!res.ok) {
          const err = await res.json()
          setMediaError(err.error || '이미지 업로드에 실패했어요')
          return
        }
        const { images: uploaded } = await res.json()
        for (const img of uploaded as { url: string }[]) {
          editor.chain()
            .focus()
            .setImage({ src: img.url })
            .createParagraphNear()
            .run()
        }
      } catch {
        setMediaError('이미지 업로드에 실패했어요')
      } finally {
        setIsUploadingImage(false)
        e.target.value = ''
      }
    },
    [editor],
  )

  // ─── 동영상 직접 업로드 핸들러 ───
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
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/uploads/video', { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json()
          setMediaError(err.error || '동영상 업로드에 실패했어요')
          return
        }
        const { url } = await res.json()
        editor.chain()
          .focus()
          .insertContent({ type: 'video', attrs: { src: url } })
          .createParagraphNear()
          .run()
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
    setYoutubeUrl('')
    setYoutubeError('')
    setVideoSheet('closed')
  }, [editor, youtubeUrl])

  if (!editor) return null

  const isUploading = isUploadingImage || isUploadingVideo

  return (
    <div className="relative">
      {/* ── sticky 툴바 래퍼 (서식 + 미디어) ── */}
      {/* top: 모바일 Header(56) + IconMenu(64) + WriteHeader(52) = 172px / 데스크탑 GNB(64) + WriteHeader(52) = 116px */}
      <div className="sticky top-[172px] lg:top-[116px] z-20 bg-card pt-1 pb-0.5">
        {/* ── 1. 서식 툴바 ── */}
        <div className="flex items-center gap-1 border border-border rounded-xl bg-card px-2 py-1 mb-2">
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

          {/* 수평선 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-body transition-colors text-foreground hover:bg-muted"
          >
            ——
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
        </div>

        {/* ── 2. 미디어 버튼 ── */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            onClick={() => { setMediaError(''); fileInputRef.current?.click() }}
            disabled={isUploadingImage}
            className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-border bg-card text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-lg">{isUploadingImage ? '⏳' : '📷'}</span>
            <span>{isUploadingImage ? '업로드 중...' : '사진 추가'}</span>
          </button>

          <button
            type="button"
            onClick={() => { setMediaError(''); setVideoSheet('picking') }}
            disabled={isUploadingVideo}
            className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-border bg-card text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-lg">{isUploadingVideo ? '⏳' : '🎬'}</span>
            <span>{isUploadingVideo ? '업로드 중...' : '동영상 추가'}</span>
          </button>
        </div>
      </div>

      {/* ── 미디어 에러 메시지 (통합) ── */}
      {mediaError && (
        <p className="text-sm text-destructive mb-2">{mediaError}</p>
      )}

      {/* ── 3. 에디터 본문 ── */}
      <div
        className="border-2 border-border rounded-xl bg-card transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(255,111,97,0.1)]"
        onClick={() => setMediaError('')}
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
        accept="image/jpeg,image/png,image/gif,image/webp"
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
