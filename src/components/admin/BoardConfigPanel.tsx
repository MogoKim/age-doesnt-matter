'use client'

import { useState, useTransition } from 'react'
import { adminUpdateBoardConfig } from '@/lib/actions/admin'
import type { Grade } from '@/generated/prisma/client'

const GRADE_OPTIONS: { value: Grade; label: string }[] = [
  { value: 'SPROUT', label: '새싹 🌱' },
  { value: 'REGULAR', label: '단골 🌿' },
  { value: 'VETERAN', label: '터줏대감 💎' },
  { value: 'WARM_NEIGHBOR', label: '따뜻한이웃 ☀️' },
]

interface BoardConfig {
  id: string
  boardType: string
  displayName: string
  description: string | null
  categories: string[]
  writeGrade: string
  isActive: boolean
  hotThreshold: number
  fameThreshold: number
}

interface BoardConfigPanelProps {
  configs: BoardConfig[]
}

export default function BoardConfigPanel({ configs }: BoardConfigPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{
    displayName: string
    description: string
    categories: string
    writeGrade: Grade
    hotThreshold: number
    fameThreshold: number
    isActive: boolean
  } | null>(null)

  function startEdit(config: BoardConfig) {
    setEditId(config.id)
    setEditData({
      displayName: config.displayName,
      description: config.description || '',
      categories: config.categories.join(', '),
      writeGrade: config.writeGrade as Grade,
      hotThreshold: config.hotThreshold,
      fameThreshold: config.fameThreshold,
      isActive: config.isActive,
    })
  }

  function handleSave() {
    if (!editId || !editData) return
    startTransition(async () => {
      await adminUpdateBoardConfig(editId, {
        displayName: editData.displayName,
        description: editData.description || undefined,
        categories: editData.categories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        writeGrade: editData.writeGrade,
        hotThreshold: editData.hotThreshold,
        fameThreshold: editData.fameThreshold,
        isActive: editData.isActive,
      })
      setEditId(null)
      setEditData(null)
    })
  }

  return (
    <div className="space-y-3">
      {configs.map((config) => {
        const isEditing = editId === config.id

        return (
          <div
            key={config.id}
            className={`rounded-xl border bg-white p-5 ${
              config.isActive ? 'border-zinc-200' : 'border-zinc-200 opacity-60'
            }`}
          >
            {!isEditing ? (
              /* 뷰 모드 */
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900">{config.displayName}</h3>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                      {config.boardType}
                    </span>
                    {!config.isActive && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        비활성
                      </span>
                    )}
                  </div>
                  {config.description && (
                    <p className="mt-1 text-xs text-zinc-500">{config.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>글쓰기 권한: {GRADE_OPTIONS.find((g) => g.value === config.writeGrade)?.label || config.writeGrade}</span>
                    <span>뜨는글 컷: {config.hotThreshold}</span>
                    <span>명예의전당 컷: {config.fameThreshold}</span>
                  </div>
                  {config.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {config.categories.map((cat) => (
                        <span key={cat} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => startEdit(config)}
                  className="rounded px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  수정
                </button>
              </div>
            ) : (
              /* 편집 모드 */
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">표시명</label>
                    <input
                      value={editData?.displayName || ''}
                      onChange={(e) => setEditData(editData ? { ...editData, displayName: e.target.value } : null)}
                      className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">설명</label>
                    <input
                      value={editData?.description || ''}
                      onChange={(e) => setEditData(editData ? { ...editData, description: e.target.value } : null)}
                      className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">말머리 (콤마 구분)</label>
                    <input
                      value={editData?.categories || ''}
                      onChange={(e) => setEditData(editData ? { ...editData, categories: e.target.value } : null)}
                      className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                      placeholder="일상, 건강, 여행"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">글쓰기 권한</label>
                    <select
                      value={editData?.writeGrade || 'SPROUT'}
                      onChange={(e) => setEditData(editData ? { ...editData, writeGrade: e.target.value as Grade } : null)}
                      className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">뜨는글 추천컷</label>
                    <input
                      type="number"
                      value={editData?.hotThreshold ?? 10}
                      onChange={(e) => setEditData(editData ? { ...editData, hotThreshold: Number(e.target.value) } : null)}
                      className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">명예의전당 추천컷</label>
                    <input
                      type="number"
                      value={editData?.fameThreshold ?? 50}
                      onChange={(e) => setEditData(editData ? { ...editData, fameThreshold: Number(e.target.value) } : null)}
                      className="h-9 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={editData?.isActive ?? true}
                    onChange={(e) => setEditData(editData ? { ...editData, isActive: e.target.checked } : null)}
                    className="rounded border-zinc-300"
                  />
                  게시판 활성화
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isPending}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => { setEditId(null); setEditData(null) }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {configs.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
          게시판 설정이 없습니다.
        </div>
      )}
    </div>
  )
}
