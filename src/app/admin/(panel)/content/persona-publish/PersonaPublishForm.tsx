'use client'

import { useMemo, useState, useTransition } from 'react'
import { getBoardDisplayName } from '@/lib/board-constants'
import {
  FOUNDER_PERSONA_CONTENT_MIN,
  FOUNDER_PERSONA_TITLE_MAX,
  validateFounderPersonaInput,
} from '@/lib/founder-personas'
import { publishAsFounderPersona } from '@/lib/actions/admin/admin.persona-publish'

export interface PersonaOption {
  id: string
  displayName: string
  accountEmail: string
  boardTypes: string[]
  voice: string
  /** DB에서 조회한 실제 표시 닉네임 — 계정이 없으면 null */
  nickname: string | null
  /** null이면 선택 가능. 값이 있으면 선택 불가 사유. */
  unavailableReason: string | null
}

type Stage = 'edit' | 'preview'

interface Published {
  postUrl: string
  authorNickname: string
}

/**
 * 작성 → 미리보기 → 발행 2단계 폼.
 *
 * 미리보기 단계에는 **서버 호출도 DB write도 없다** — 입력값을 그대로 화면에 그린다.
 * 서버는 평문을 plainTextToSafeHtml(이스케이프 + 줄바꿈 <p> 분할)로 저장하므로,
 * 미리보기의 whitespace-pre-wrap 렌더와 결과가 일치한다.
 * DB에 쓰이는 시점은 마지막 '발행' 버튼 하나뿐이다.
 */
export default function PersonaPublishForm({ options }: { options: PersonaOption[] }) {
  const selectable = useMemo(() => options.filter((o) => !o.unavailableReason), [options])

  const [personaId, setPersonaId] = useState(selectable[0]?.id ?? '')
  const [boardType, setBoardType] = useState(selectable[0]?.boardTypes[0] ?? '')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [stage, setStage] = useState<Stage>('edit')
  const [error, setError] = useState('')
  const [published, setPublished] = useState<Published | null>(null)
  const [isPending, startTransition] = useTransition()

  const persona = options.find((o) => o.id === personaId) ?? null
  const canPublish = Boolean(persona && !persona.unavailableReason)

  function handlePersonaChange(nextId: string) {
    setPersonaId(nextId)
    const next = options.find((o) => o.id === nextId)
    // 페르소나를 바꾸면 현재 게시판이 허용 목록 밖일 수 있다 → 첫 허용 게시판으로 되돌린다
    if (next && !next.boardTypes.includes(boardType)) {
      setBoardType(next.boardTypes[0] ?? '')
    }
    setError('')
  }

  function handlePreview() {
    const result = validateFounderPersonaInput({ personaId, boardType, title, content })
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError('')
    setStage('preview')
  }

  function handlePublish() {
    if (!canPublish) return
    setError('')
    startTransition(async () => {
      const result = await publishAsFounderPersona({ personaId, boardType, title, content })
      if ('error' in result) {
        setError(result.error)
        setStage('edit')
        return
      }
      setPublished({ postUrl: result.postUrl, authorNickname: result.authorNickname })
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
    return (
      <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 p-6">
        <p className="text-base font-semibold text-emerald-900">발행됐어요</p>
        <p className="text-sm text-emerald-800">
          작성자 <strong>{published.authorNickname}</strong> · {getBoardDisplayName(boardType)}
        </p>
        <a
          href={published.postUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block break-all text-sm text-emerald-700 underline"
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
          페르소나
        </label>
        <select
          id="persona"
          value={personaId}
          onChange={(e) => handlePersonaChange(e.target.value)}
          disabled={stage === 'preview'}
          className="min-h-[52px] w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id} disabled={Boolean(o.unavailableReason)}>
              {o.displayName}
              {o.nickname ? ` — ${o.nickname}` : ''}
              {o.unavailableReason ? ` (${o.unavailableReason})` : ''}
            </option>
          ))}
        </select>
        {persona && (
          <p className="mt-1 text-xs text-zinc-500">
            {persona.unavailableReason
              ? `이 페르소나로는 발행할 수 없습니다 — ${persona.unavailableReason}`
              : persona.voice}
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
          disabled={stage === 'preview' || !persona}
          className="min-h-[52px] w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        >
          {(persona?.boardTypes ?? []).map((b) => (
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
            {getBoardDisplayName(boardType)} · {persona?.nickname ?? persona?.displayName}
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
            disabled={!canPublish}
            className="min-h-[52px] rounded-lg bg-zinc-800 px-6 text-base font-medium text-white disabled:bg-zinc-300"
          >
            미리보기
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPending || !canPublish}
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
        발행하면 곧바로 서비스에 공개됩니다. 임시저장·예약 발행은 이 화면에서 지원하지 않습니다.
      </p>
    </div>
  )
}
