'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// ─── 등급별 업로드 권한 ───
const UPLOAD_GRADES = ['REGULAR', 'VETERAN', 'WARM_NEIGHBOR']
const MAX_IMAGES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  userGrade?: string
  placeholder?: string
  onImagesChange?: (images: ImagePreview[]) => void
}

export interface ImagePreview {
  file: File
  url: string
}

export default function TipTapEditor({
  content,
  onChange,
  userGrade = 'SEEDLING',
  placeholder = '내용을 입력해 주세요 (10자 이상)',
  onImagesChange,
}: TipTapEditorProps) {
  const [images, setImages] = useState<ImagePreview[]>([])
  const [showYouTubeInput, setShowYouTubeInput] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeError, setYoutubeError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canUploadImages = UPLOAD_GRADES.includes(userGrade)
  const [showGradeAlert, setShowGradeAlert] = useState(false)

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
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-xl max-w-full h-auto my-3',
        },
      }),
      Youtube.configure({
        width: 0,
        height: 0,
        HTMLAttributes: {
          class: 'aspect-video w-full rounded-xl overflow-hidden my-3',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-lg max-w-none min-h-[250px] p-4 text-base leading-[1.85] text-foreground outline-none focus:outline-none [word-break:keep-all]',
      },
    },
  })

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
    if (!canUploadImages) {
      setShowGradeAlert(true)
      setTimeout(() => setShowGradeAlert(false), 3000)
      return
    }
    fileInputRef.current?.click()
  }, [canUploadImages])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      const errors: string[] = []

      const valid = files.filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          errors.push(`${f.name}은(는) 5MB를 초과합니다.`)
          return false
        }
        if (!f.type.startsWith('image/')) return false
        return true
      })

      const remaining = MAX_IMAGES - images.length
      const toAdd = valid.slice(0, remaining).map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }))

      if (toAdd.length > 0) {
        setImages((prev) => [...prev, ...toAdd])
      }

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

  // ─── 유튜브 삽입 핸들러 ───
  const handleYouTubeInsert = useCallback(() => {
    if (!editor) return
    const isValid = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(youtubeUrl)
    if (!isValid) {
      setYoutubeError('올바른 유튜브 주소를 입력해 주세요')
      return
    }

    if (!canUploadImages) {
      setShowGradeAlert(true)
      setTimeout(() => setShowGradeAlert(false), 3000)
      setShowYouTubeInput(false)
      return
    }

    editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run()
    setYoutubeUrl('')
    setYoutubeError('')
    setShowYouTubeInput(false)
  }, [editor, youtubeUrl, canUploadImages])

  if (!editor) return null

  return (
    <div className="relative">
      {/* 등급 부족 알림 */}
      {showGradeAlert && (
        <div className="absolute top-0 left-0 right-0 z-10 mx-4 mt-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-center shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-base font-bold text-amber-800 mb-1">
            🌿 단골 등급부터 가능해요
          </p>
          <p className="text-sm text-amber-600">
            글 5개 쓰거나 댓글 20개 달면 단골이 돼요
          </p>
        </div>
      )}

      {/* 에디터 본문 */}
      <div className="border-2 border-border rounded-xl bg-card transition-all focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(255,111,97,0.1)]">
        <EditorContent editor={editor} />

        {/* 첨부 이미지 프리뷰 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-3 px-4 pb-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={`첨부 ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 w-7 h-7 bg-black/60 text-white rounded-full text-xs flex items-center justify-center cursor-pointer hover:bg-black/80 transition-colors"
                  onClick={() => removeImage(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
            <p className="w-full text-xs text-muted-foreground">
              {images.length}/{MAX_IMAGES}장
            </p>
          </div>
        )}

        {/* ─── 하단 고정 툴바 (시니어 친화 52px) ─── */}
        <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
          {/* 사진 */}
          <button
            type="button"
            onClick={handleImageClick}
            className={cn(
              'flex items-center gap-1.5 min-h-[52px] min-w-[52px] px-3 rounded-xl text-sm font-medium transition-colors',
              canUploadImages
                ? 'text-foreground hover:bg-primary/5 hover:text-primary'
                : 'text-muted-foreground/50 cursor-not-allowed',
            )}
          >
            <span className="text-lg">📷</span>
            <span className="text-sm">사진</span>
          </button>

          {/* 동영상 */}
          <button
            type="button"
            onClick={() => {
              if (!canUploadImages) {
                setShowGradeAlert(true)
                setTimeout(() => setShowGradeAlert(false), 3000)
                return
              }
              setShowYouTubeInput(!showYouTubeInput)
            }}
            className={cn(
              'flex items-center gap-1.5 min-h-[52px] min-w-[52px] px-3 rounded-xl text-sm font-medium transition-colors',
              canUploadImages
                ? 'text-foreground hover:bg-primary/5 hover:text-primary'
                : 'text-muted-foreground/50 cursor-not-allowed',
            )}
          >
            <span className="text-lg">🎬</span>
            <span className="text-sm">동영상</span>
          </button>

          {/* 구분선 */}
          <div className="w-px h-8 bg-border mx-1" />

          {/* 굵게 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'flex items-center justify-center min-h-[52px] min-w-[52px] lg:min-h-[44px] lg:min-w-[44px] rounded-xl text-base font-bold transition-colors',
              editor.isActive('bold')
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted',
            )}
          >
            B
          </button>

          {/* 기울임 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'flex items-center justify-center min-h-[52px] min-w-[52px] lg:min-h-[44px] lg:min-w-[44px] rounded-xl text-base italic transition-colors',
              editor.isActive('italic')
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted',
            )}
          >
            I
          </button>

          {/* 구분선 삽입 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="flex items-center justify-center min-h-[52px] min-w-[52px] lg:min-h-[44px] lg:min-w-[44px] rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <span className="block w-5 h-0.5 bg-current rounded-full" />
          </button>
        </div>
      </div>

      {/* 유튜브 URL 입력 팝업 */}
      {showYouTubeInput && (
        <div className="mt-2 p-4 border-2 border-border rounded-xl bg-card shadow-lg">
          <p className="text-base font-bold text-foreground mb-2">유튜브 주소를 붙여넣어 주세요</p>
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => {
              setYoutubeUrl(e.target.value)
              setYoutubeError('')
            }}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full min-h-[48px] px-4 border-2 border-border rounded-xl text-base text-foreground bg-background outline-none focus:border-primary transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleYouTubeInsert()
              }
            }}
          />
          {youtubeError && (
            <p className="text-sm text-destructive mt-1">{youtubeError}</p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                setShowYouTubeInput(false)
                setYoutubeUrl('')
                setYoutubeError('')
              }}
              className="min-h-[48px] px-6 border-2 border-border rounded-xl text-sm font-bold text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleYouTubeInsert}
              className="min-h-[48px] px-6 bg-primary text-white rounded-xl text-sm font-bold hover:bg-[#E85D50] transition-colors"
            >
              삽입
            </button>
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
