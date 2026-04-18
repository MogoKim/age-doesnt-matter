#!/usr/bin/env node
// 각 페이지 metadata에 alternates.canonical 추가

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const BASE = 'https://age-doesnt-matter.com'

const PAGES = [
  { file: 'src/app/(main)/about/page.tsx', url: '/about' },
  { file: 'src/app/(main)/grade/page.tsx', url: '/grade' },
  { file: 'src/app/(main)/contact/page.tsx', url: '/contact' },
  { file: 'src/app/(main)/terms/page.tsx', url: '/terms' },
  { file: 'src/app/(main)/privacy/page.tsx', url: '/privacy' },
  { file: 'src/app/(main)/rules/page.tsx', url: '/rules' },
  { file: 'src/app/(main)/search/page.tsx', url: '/search' },
  { file: 'src/app/(main)/best/page.tsx', url: '/best' },
  { file: 'src/app/(main)/jobs/page.tsx', url: '/jobs' },
  { file: 'src/app/(main)/page.tsx', url: '/' },
  { file: 'src/app/login/page.tsx', url: '/login' },
]

let updated = 0
let skipped = 0

for (const { file, url } of PAGES) {
  const filePath = path.join(ROOT, file)
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${file}`)
    skipped++
    continue
  }

  let content = fs.readFileSync(filePath, 'utf8')

  // 이미 alternates.canonical이 있으면 스킵
  if (content.includes('alternates') && content.includes('canonical')) {
    console.log(`SKIP (already has canonical): ${file}`)
    skipped++
    continue
  }

  // metadata 객체의 닫는 }를 찾아서 alternates 추가
  // 패턴: export const metadata: Metadata = { ... }
  // description 또는 title 마지막 줄 다음에 추가
  const canonicalLine = `  alternates: { canonical: '${BASE}${url}' },`

  // metadata 블록의 마지막 필드 뒤, 닫는 } 앞에 삽입
  // 방법: 첫 번째 export const metadata = { ... } 블록을 찾아서 } 직전에 삽입
  const metadataRegex = /(export const metadata: Metadata = \{[\s\S]*?)\n(\})/
  const match = content.match(metadataRegex)

  if (!match) {
    console.log(`SKIP (no metadata pattern): ${file}`)
    skipped++
    continue
  }

  const replacement = `${match[1]}\n${canonicalLine}\n${match[2]}`
  content = content.replace(metadataRegex, replacement)

  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`UPDATED: ${file} → ${BASE}${url}`)
  updated++
}

console.log(`\n완료: ${updated}개 업데이트, ${skipped}개 스킵`)
