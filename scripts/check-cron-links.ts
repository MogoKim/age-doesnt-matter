#!/usr/bin/env tsx
/**
 * Cron Link Checker — runner.ts HANDLERS ↔ GitHub Actions 워크플로우 연결 검증
 * 사용법: npx tsx scripts/check-cron-links.ts
 */

import { readFileSync, readdirSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const RUNNER_PATH = join(ROOT, 'agents/cron/runner.ts')
const WORKFLOWS_DIR = join(ROOT, '.github/workflows')

interface HandlerInfo { key: string; importPath: string }

interface Report {
  total: number
  linked: number
  orphaned: string[]
  dispatchOnly: string[]
  localOnly: string[]
  unlinkedWithoutReason: string[]
}

function extractHandlers(): HandlerInfo[] {
  const src = readFileSync(RUNNER_PATH, 'utf-8')
  const results: HandlerInfo[] = []
  const re = /^\s*'([^']+)':\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    results.push({ key: m[1], importPath: m[2] })
  }
  return results
}

function extractWorkflowKeys(): Set<string> {
  const keys = new Set<string>()
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.startsWith('agents-') && f.endsWith('.yml'))
  for (const file of files) {
    const content = readFileSync(join(WORKFLOWS_DIR, file), 'utf-8')
    // Match: runner.ts <agent> <task> or echo "agent=X" / echo "task=Y"
    const runnerRe = /runner\.ts\s+(\S+)\s+(\S+)/g
    let m: RegExpExecArray | null
    while ((m = runnerRe.exec(content)) !== null) {
      keys.add(`${m[1].toLowerCase()}:${m[2]}`)
    }
    // Match determine step output pairs
    const agentRe = /echo\s+["']agent=([^"'\s]+)["']/g
    const taskRe = /echo\s+["']task=([^"'\s]+)["']/g
    const agents: string[] = []
    const tasks: string[] = []
    while ((m = agentRe.exec(content)) !== null) agents.push(m[1].toLowerCase())
    while ((m = taskRe.exec(content)) !== null) tasks.push(m[1])
    for (let i = 0; i < Math.min(agents.length, tasks.length); i++) {
      keys.add(`${agents[i]}:${tasks[i]}`)
    }
  }
  return keys
}

function resolveSourcePath(importPath: string): string {
  // Convert relative import like '../cmo/band-manager.js' to absolute .ts path
  const tsPath = importPath.replace(/\.js$/, '.ts')
  return resolve(join(ROOT, 'agents/cron'), tsPath)
}

function hasExemptComment(filePath: string): 'dispatch' | 'local' | null {
  try {
    const src = readFileSync(filePath, 'utf-8')
    if (/\/\/\s*DISPATCH\s+ONLY/i.test(src)) return 'dispatch'
    if (/\/\/\s*LOCAL\s+ONLY/i.test(src)) return 'local'
  } catch { /* file not found */ }
  return null
}

function main() {
  const handlers = extractHandlers()
  const workflowKeys = extractWorkflowKeys()

  const orphaned: string[] = []
  const dispatchOnly: string[] = []
  const localOnly: string[] = []
  const unlinkedWithoutReason: string[] = []

  for (const { key, importPath } of handlers) {
    if (workflowKeys.has(key)) continue
    orphaned.push(key)
    const srcPath = resolveSourcePath(importPath)
    const exempt = hasExemptComment(srcPath)
    if (exempt === 'dispatch') dispatchOnly.push(key)
    else if (exempt === 'local') localOnly.push(key)
    else unlinkedWithoutReason.push(key)
  }

  const report: Report = {
    total: handlers.length,
    linked: handlers.length - orphaned.length,
    orphaned,
    dispatchOnly,
    localOnly,
    unlinkedWithoutReason,
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(unlinkedWithoutReason.length > 0 ? 1 : 0)
}

main()
