// 거울 보드 로컬 웹 서버 — SSE 실시간 칸반.
// 보안: 반드시 127.0.0.1 only bind. SSE payload에는 토큰/env/DB URL이 들어가지 않는다
// (probe.detail이 이미 화이트리스트된 값만 담는다).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getCache, subscribe, startScheduler } from './engine/scheduler.js'
import type { BoardState } from './engine/evaluator.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(HERE, 'public')
const HOST = '127.0.0.1' // 절대 0.0.0.0 금지
const PORT = 4321

function serialize(state: BoardState): string {
  return JSON.stringify(state)
}

async function serveStatic(res: ServerResponse, file: string, type: string): Promise<void> {
  try {
    const buf = await readFile(join(PUBLIC_DIR, file))
    res.writeHead(200, { 'Content-Type': type })
    res.end(buf)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  }
}

function handleSSE(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  const send = (s: BoardState): void => {
    res.write(`data: ${serialize(s)}\n\n`)
  }
  const snapshot = getCache()
  if (snapshot) send(snapshot) // 신규 연결 시 현재 상태 즉시 전송
  const unsubscribe = subscribe(send)
  req.on('close', () => {
    unsubscribe()
  })
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? '/'
  if (url === '/events') return handleSSE(req, res)
  if (url === '/' || url === '/index.html') {
    void serveStatic(res, 'index.html', 'text/html; charset=utf-8')
    return
  }
  if (url === '/board.js') {
    void serveStatic(res, 'board.js', 'text/javascript; charset=utf-8')
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('not found')
})

startScheduler(60_000)
server.listen(PORT, HOST, () => {
  console.log(`[ops-board] 거울 보드 실행 중 → http://${HOST}:${PORT}  (127.0.0.1 only)`)
})
