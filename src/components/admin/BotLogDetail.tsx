'use client'

import { useState } from 'react'

interface LogData {
  id: string
  botType: string
  status: string
  action: string | null
  itemCount: number
  executionTimeMs: number
  details: string | null
  executedAt: Date
}

interface Props {
  log: LogData
  typeLabel: string
  badge: { label: string; className: string }
  execSec: string
}

export default function BotLogDetail({ log, typeLabel, badge, execSec }: Props) {
  const [expanded, setExpanded] = useState(false)

  let parsedDetails: Record<string, unknown> | null = null
  if (log.details) {
    try {
      parsedDetails = JSON.parse(log.details)
    } catch {
      // not JSON
    }
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-zinc-50"
      >
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-zinc-900">{typeLabel}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {log.action && (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {log.action}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>{log.itemCount}건</span>
          <span>{execSec}s</span>
          <span>{new Date(log.executedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="text-zinc-300">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4">
          {parsedDetails ? (
            <pre className="overflow-auto text-xs leading-relaxed text-zinc-700">
              {JSON.stringify(parsedDetails, null, 2)}
            </pre>
          ) : log.details ? (
            <p className="text-xs text-zinc-600">{log.details}</p>
          ) : (
            <p className="text-xs text-zinc-400">상세 데이터가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
