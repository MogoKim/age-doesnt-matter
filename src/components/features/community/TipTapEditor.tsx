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

const MAX_IMAGES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024   // 5MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

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
  { label: '가', size: null, title: '기본 (18px)' },
  { label: '가', size: '20px', title: '크게 (20px)' },
  { label: '가', size: '24px', title: '더 크게 (24px)' },
  { label: '가', size: '30px', title: '최대 (30px)' },
] as const

type VideoSheet = 'closed' | 'picking' | 'youtube'

export interface ImagePreview {
  file: File
  url: string
}

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  onImagesChange?: (images: ImagePreview[]) => void
}

export default function TipTapEditor({
  content,
  onChange,
  placeholder = '내용을 입력해 주세요 (10자 이상)',
  onImagesChange,
}: TipTapEditorProps) {
  const [images, setImages] = useState<ImagePreview[]>([])
  const [videoSheet, setVideoSheet] = useState<VideoSheet>('closed')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeError, setYoutubeError] = useState('')
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [videoUploadError, setVideoUploadError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  // paste handler에서 editor에 접근하기 위한 ref
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
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
          editorRef.current?.chain().focus().setYoutubeVideo({ src: trimmed }).run()
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

  // 이미지 변경 시 부모에게 알림
  useEffect(() => {
    onImagesChange?.(images)
  }, [images, onImagesChange])

  // ─── 이미지 첨부 핸들러 ───
  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      const valid = files.filter((f) => f.size <= MAX_FILE_SIZE && f.type.startsWith('image/'))
      const remaining = MAX_IMAGES - images.length
      const toAdd = valid.slice(0, remaining).map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }))
      if (toAdd.length > 0) setImages((prev) => [...prev, ...toAdd])
      e.target.value = ''
    },
    [images.length],
  )

  const removeImage = useCallback((idx: number) => {
    setImages((prev) => {
      const removed = prev[idx]
      if (removed) URL.revokeObjectURL(removed.url)
      return prev.filter((_, i) => i !== idx)
    })
  }, [])

  // ─── 동영상 직접 업로드 핸들러 ───
  const handleVideoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !editor) return

      if (file.size > MAX_VIDEO_SIZE) {
        setVideoUploadError('동영상은 최대 100MB까지 업로드할 수 있어요')
        e.target.value = ''
        return
      }

      setIsUploadingVideo(true)
      setVideoUploadError('')
      setVideoSheet('closed')

      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/uploads/video', { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json()
          setVideoUploadError(err.error || '동영상 업로드에 실패했어요')
          return
        }
        const { url } = await res.json()
        editor.chain().focus().insertContent({ type: 'video', attrs: { src: url } }).run()
      } catch {
        setVideoUploadError('동영상 업로드에 실패했어요')
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
    editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run()
    setYoutubeUrl('')
    setYoutubeError('')
    setVideoSheet('closed')
  }, [editor, youtubeUrl])

  if (!editor) return null

  return (
    <div className="relative">
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

        {/* 기울임 */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-body italic transition-colors',
            editor.isActive('italic') ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
          )}
        >
          I
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
          onClick={handleImageClick}
          disabled={images.length >= MAX_IMAGES}
          className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-border bg-card text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-lg">📷</span>
          <span>사진 추가 {images.length > 0 && `(${images.length}/${MAX_IMAGES})`}</span>
        </button>

        <button
          type="button"
          onClick={() => setVideoSheet('picking')}
          disabled={isUploadingVideo}
          className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-border bg-card text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="text-lg">{isUploadingVideo ? '⏳' : '🎬'}</span>
          <span>{isUploadingVideo ? '업로드 중...' : '동영상 추가'}</span>
        </button>
      </div>

      {videoUploadError && (
        <p className="text-sm text-destructive mb-2">{videoUploadError}</p>
      )}

      {/* ── 3. 에디터 본문 ── */}
      <div className="border-2 border-border rounded-xl bg-card transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(255,111,97,0.1)]">
        <EditorContent editor={editor} />

        {/* ── 4. 첨부 이미지 프리뷰 ── */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3 px-4 pb-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={`첨부 ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 w-7 h-7 bg-black/60 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/80 transition-colors"
                  onClick={() => removeImage(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl border-2 border-border bg-background text-body font-medium text-foreground text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="text-2xl">🎞</span>
                    <div>
                      <p className="font-bold">내 동영상 올리기</p>
                      <p className="text-caption text-muted-foreground">MP4, MOV, WebM · 최대 100MB</p>
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
        onChange={handleFileChange}
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
        }
        .tiptap p {
          margin: 0.5em 0;
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
    </div>
  )
}
