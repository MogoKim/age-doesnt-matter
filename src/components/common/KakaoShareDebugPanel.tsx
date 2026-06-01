'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  enableKakaoShareDebugFromQuery,
  isKakaoShareDebugEnabled,
  readKakaoShareDebugLogs,
  clearKakaoShareDebugLogs,
  copyKakaoShareDebugLogs,
  type KakaoShareLogEntry,
} from '@/lib/kakao-share-debug'

function eventColor(event: string): string {
  if (/TIMEOUT|THROW|FAILED|FALSE|ERROR|REJECTION/.test(event)) return '#f66'
  if (/OK|RETURNED|COPY_OK|MOUNTED|LOADED|READY/.test(event)) return '#6f6'
  if (/START|OPEN|CLICK|SHOW|FOCUS/.test(event)) return '#6af'
  return '#ff0'
}

export default function KakaoShareDebugPanel() {
  const [enabled, setEnabled] = useState(false)
  const [logs, setLogs] = useState<KakaoShareLogEntry[]>([])
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(() => setLogs(readKakaoShareDebugLogs()), [])

  useEffect(() => {
    enableKakaoShareDebugFromQuery()
    if (!isKakaoShareDebugEnabled()) return
    setEnabled(true)
    refresh()

    const handler = () => refresh()
    window.addEventListener('kakao-share-debug-log', handler)
    return () => window.removeEventListener('kakao-share-debug-log', handler)
  }, [refresh])

  if (!enabled) return null

  async function handleCopy() {
    await copyKakaoShareDebugLogs()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClear() {
    clearKakaoShareDebugLogs()
    setLogs([])
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        color: '#ccc',
        fontFamily: 'monospace',
        fontSize: '11px',
        maxHeight: '40vh',
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid #444',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '1px solid #333', flexShrink: 0 }}>
        <span style={{ fontWeight: 'bold', color: '#ff0' }}>🔍 kakaoShare debug</span>
        <button
          onClick={handleCopy}
          style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
        >
          {copied ? '✅ Copied!' : 'Copy logs'}
        </button>
        <button
          onClick={handleClear}
          style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
        >
          Clear logs
        </button>
        <span style={{ color: '#555', marginLeft: 'auto' }}>{logs.length} entries</span>
      </div>

      {/* log list — newest first */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <div style={{ padding: '8px 10px', color: '#555' }}>No logs yet. Click share → 카카오톡 to record.</div>
        ) : (
          [...logs].reverse().map((log, i) => (
            <div
              key={i}
              style={{
                padding: '2px 8px',
                borderBottom: '1px solid #1a1a1a',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: '#555' }}>{log.ts.slice(11, 23)}</span>{' '}
              <span style={{ color: eventColor(log.event), fontWeight: 'bold' }}>{log.event}</span>
              {log.payload != null && (
                <span style={{ color: '#888' }}> {JSON.stringify(log.payload)}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
