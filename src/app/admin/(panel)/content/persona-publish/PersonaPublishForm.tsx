'use client'

import { useMemo, useState, useTransition } from 'react'
import { getBoardDisplayName } from '@/lib/board-constants'
import {
  FOUNDER_PERSONA_BOARD_TYPES,
  FOUNDER_PERSONA_CONTENT_MIN,
  FOUNDER_PERSONA_TITLE_MAX,
  validateFounderPersonaInput,
} from '@/lib/founder-personas'
import { publishAsFounderPersona } from '@/lib/actions/admin/admin.persona-publish'

export interface PersonaOption {
  /** DB User.email — 페르소나 식별자 */
  email: string
  /** DB User.nickname — 화면에 실제로 보이는 이름의 정본 */
  nickname: string
  origin: 'seed' | 'curator'
  /** 과거 registry의 기본 게시판 — 힌트일 뿐 제약이 아니다 */
  registryBoard: string
  /** ISO 문자열. 한 번도 안 썼으면 null */
  lastPostedAt: string | null
  lastTitle: string | null
  lastBoardType: string | null
}

type Stage = 'edit' | 'preview'

interface PublishedState {
  postUrl: string
  authorNickname: string
  duplicate: boolean
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function lastUseLabel(o: PersonaOption): string {
  if (!o.lastPostedAt) return '발행 기록 없음'
  const days = daysSince(o.lastPostedAt)
  const when = days === 0 ? '오늘' : `${days}일 전`
  const where = o.lastBoardType ? getBoardDisplayName(o.lastBoardType) : null
  return [when, where, o.lastTitle].filter(Boolean).join(' · ')
}

/**
 * 작성 → 미리보기 → 발행 2단계 폼.
 *
 * 미리보기 단계에는 **서버 호출도 DB write도 없다** — 입력값을 그대로 화면에 그린다.
 * 서버는 평문을 plainTextToSafeHtml(이스케이프 + 줄바꿈 <p> 분할)로 저장하므로,
 * 미리보기의 whitespace-pre-wrap 렌더와 결과가 일치한다.
 * DB에 쓰이는 시점은 마지막 '발행' 버튼 하나뿐이다.
 *
 * 목록에 오는 페르소나는 전부 DB에 있고 ACTIVE인 계정이다(서버 컴포넌트에서 이미 걸렀다).
 */
export default function PersonaPublishForm({ options }: { options: PersonaOption[] }) {
  const [personaEmail, setPersonaEmail] = useState(options[0]?.email ?? '')
  const [boardType, setBoardType] = useState<string>(FOUNDER_PERSONA_BOARD_TYPES[0])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [stage, setStage] = useState<Stage>('edit')
  const [error, setError] = useState('')
  const [published, setPublished] = useState<PublishedState | null>(null)
  const [isPending, startTransition] = useTransition()

  const persona = useMemo(
    () => options.find((o) => o.email === personaEmail) ?? null,
    [options, personaEmail],
  )

  function handlePreview() {
    const result = validateFounderPersonaInput({ personaEmail, boardType, title, content })
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError('')
    setStage('preview')
  }

  function handlePublish() {
    setError('')
    startTransition(async () => {
      const result = await publishAsFounderPersona({ personaEmail, boardType, title, content })
      if ('error' in result) {
        setError(result.error)
        setStage('edit')
        return
      }
      setPublished({
        postUrl: result.postUrl,
        authorNickname: result.authorNickname,
        duplicate: result.duplicate,
      })
    })
  }

  function handleWriteAnother() {
    setPublished(null)
    setStage('edit')
    setTitle('')
    setContent('')
    setError('')
  }

  if (published) {
    const tone = published.duplicate
      ? 'border-amber-300 bg-amber-50'
      : 'border-emerald-300 bg-emerald-50'
    return (
      <div className={`space-y-4 rounded-xl border p-6 ${tone}`}>
        <p className="text-base font-semibold text-zinc-900">
          {published.duplicate
            ? '이미 같은 글이 있어 새로 만들지 않았어요'
            : '발행됐어요'}
        </p>
        <p className="text-sm text-zinc-700">
          작성자 <strong>{published.authorNickname}</strong> · {getBoardDisplayName(boardType)}
        </p>
        <a
          href={published.postUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block break-all text-sm text-zinc-700 underline"
        >
          {published.postUrl}
        </a>
        <div>
          <button
            type="button"
            onClick={handleWriteAnother}
            className="min-h-[52px] rounded-lg bg-zinc-800 px-5 text-base font-medium text-white"
          >
            새 글 쓰기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="persona" className="mb-1 block text-sm font-medium text-zinc-700">
          페르소나{' '}
          <span className="font-normal text-zinc-400">— 오래 안 쓴 이름이 위에 옵니다</span>
        </label>
        <select
          id="persona"
          value={personaEmail}
          onChange={(e) => {
            setPersonaEmail(e.target.value)
            setError('')
          }}
          disabled={stage === 'preview'}
          className="min-h-[52px] w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        >
          {options.map((o) => (
            <option key={o.email} value={o.email}>
              {o.nickname} — {lastUseLabel(o)}
            </option>
          ))}
        </select>
        {persona && (
          <p className="mt-1 text-xs text-zinc-500">
            {persona.email} · {persona.origin} · 원래 배정 게시판{' '}
            {getBoardDisplayName(persona.registryBoard)} · 최근 사용 {lastUseLabel(persona)}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="board" className="mb-1 block text-sm font-medium text-zinc-700">
          게시판
        </label>
        <select
          id="board"
          value={boardType}
          onChange={(e) => setBoardType(e.target.value)}
          disabled={stage === 'preview'}
          className="min-h-[52px] w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        >
          {FOUNDER_PERSONA_BOARD_TYPES.map((b) => (
            <option key={b} value={b}>
              {getBoardDisplayName(b)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-zinc-700">
          제목
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={FOUNDER_PERSONA_TITLE_MAX}
          disabled={stage === 'preview'}
          placeholder="회원이 목록에서 보게 될 제목"
          className="min-h-[52px] w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />
        <p className="mt-1 text-xs text-zinc-400">
          {title.length}/{FOUNDER_PERSONA_TITLE_MAX}
        </p>
      </div>

      <div>
        <label htmlFor="content" className="mb-1 block text-sm font-medium text-zinc-700">
          본문{' '}
          <span className="font-normal text-zinc-400">
            — 평문으로 씁니다. 줄바꿈은 그대로 문단이 됩니다. ({FOUNDER_PERSONA_CONTENT_MIN}자 이상)
          </span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          disabled={stage === 'preview'}
          placeholder="직접 쓴 글을 그대로 붙여 넣으세요. HTML 태그는 글자 그대로 표시됩니다."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base leading-relaxed outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />
      </div>

      {stage === 'preview' && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            미리보기 — 아직 저장되지 않았습니다
          </p>
          <p className="text-sm text-zinc-500">
            {getBoardDisplayName(boardType)} · {persona?.nickname}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-zinc-900">{title}</h3>
          <div className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-800">
            {content}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {stage === 'edit' ? (
          <button
            type="button"
            onClick={handlePreview}
            className="min-h-[52px] rounded-lg bg-zinc-800 px-6 text-base font-medium text-white"
          >
            미리보기
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPending}
              className="min-h-[52px] rounded-lg bg-emerald-600 px-6 text-base font-medium text-white disabled:bg-zinc-300"
            >
              {isPending ? '발행 중…' : '발행'}
            </button>
            <button
              type="button"
              onClick={() => setStage('edit')}
              disabled={isPending}
              className="min-h-[52px] rounded-lg border border-zinc-300 px-6 text-base font-medium text-zinc-700"
            >
              고쳐 쓰기
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        발행하면 곧바로 서비스에 공개됩니다. 임시저장·예약 발행은 지원하지 않습니다. 같은 이름으로
        같은 게시판에 제목·본문이 똑같은 글을 10분 안에 다시 보내면 새 글을 만들지 않고 기존 글을
        알려 드립니다.
      </p>
    </div>
  )
}
