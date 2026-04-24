/**
 * 매거진 리치 HTML 템플릿
 * 가독성 높은 매거진 형식 — 시니어 친화 디자인
 */

interface MagazineSection {
  heading: string
  body: string
  tipBox?: string
  quote?: string
}

interface MagazineTemplateData {
  title: string
  subtitle: string
  category: string
  heroImageUrl?: string
  readingTime: number  // minutes
  sections: MagazineSection[]
  authorName: string
  publishedDate: string
}

/** 카테고리별 아이콘 */
const CATEGORY_ICONS: Record<string, string> = {
  '건강': '💪',
  '생활': '🏡',
  '재테크': '💰',
  '여행': '✈️',
  '문화': '🎭',
  '요리': '🍳',
  '일자리': '💼',
  '간병': '🤝',
}

/** 카테고리별 배지 색상 */
const CATEGORY_COLORS: Record<string, string> = {
  '건강': '#4CAF50',
  '생활': '#FF6F61',
  '재테크': '#2196F3',
  '여행': '#FF9800',
  '문화': '#9C27B0',
  '요리': '#E91E63',
  '일자리': '#607D8B',
  '간병': '#795548',
}

export function buildMagazineHtml(data: MagazineTemplateData): string {
  const icon = CATEGORY_ICONS[data.category] ?? '📖'
  const badgeColor = CATEGORY_COLORS[data.category] ?? '#FF6F61'

  const heroSection = data.heroImageUrl
    ? `<div style="margin:-24px -24px 24px -24px;border-radius:16px 16px 0 0;overflow:hidden;">
        <img src="${data.heroImageUrl}" alt="${data.title}" style="width:100%;height:auto;display:block;" />
       </div>`
    : ''

  const metaBar = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <span style="background:${badgeColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:14px;font-weight:600;">
        ${icon} ${data.category}
      </span>
      <span style="color:#888;font-size:14px;">📖 ${data.readingTime}분 읽기</span>
      <span style="color:#888;font-size:14px;">📅 ${data.publishedDate}</span>
    </div>`

  const titleBlock = `
    <h1 style="font-size:26px;font-weight:700;line-height:1.4;margin:0 0 8px 0;color:#1a1a1a;">
      ${data.title}
    </h1>
    <p style="font-size:17px;color:#666;margin:0 0 24px 0;line-height:1.5;">
      ${data.subtitle}
    </p>
    <hr style="border:none;border-top:2px solid #f0f0f0;margin:0 0 28px 0;" />`

  const sectionsHtml = data.sections.map((section) => {
    let html = ''
    if (section.heading) {
      html += `<h2 style="font-size:21px;font-weight:700;color:#333;margin:32px 0 16px 0;line-height:1.4;">${section.heading}</h2>`
    }
    html += `<div style="font-size:17px;line-height:1.8;color:#444;">${section.body}</div>`

    if (section.tipBox) {
      html += `
        <div style="background:#FFF8E1;border-left:4px solid #FFB300;padding:16px 20px;margin:20px 0;border-radius:0 12px 12px 0;">
          <p style="margin:0;font-size:16px;line-height:1.6;color:#5D4037;">
            <strong>💡 꿀팁</strong><br/>${section.tipBox}
          </p>
        </div>`
    }

    if (section.quote) {
      html += `
        <blockquote style="border-left:4px solid #FF6F61;padding:16px 20px;margin:20px 0;background:#FFF5F4;border-radius:0 12px 12px 0;">
          <p style="margin:0;font-size:17px;font-style:italic;color:#555;line-height:1.6;">
            "${section.quote}"
          </p>
        </blockquote>`
    }

    return html
  }).join('')

  const authorCard = `
    <div style="margin-top:40px;padding:20px;background:#f8f9fa;border-radius:12px;display:flex;align-items:center;gap:16px;">
      <div style="width:48px;height:48px;background:#FF6F61;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700;">
        우
      </div>
      <div>
        <p style="margin:0;font-size:16px;font-weight:600;color:#333;">${data.authorName}</p>
        <p style="margin:4px 0 0;font-size:14px;color:#888;">우리 나이가 어때서 매거진</p>
      </div>
    </div>`

  const ctaBlock = `
    <div style="margin-top:28px;padding:24px;background:#FFF5F4;border-radius:12px;text-align:center;">
      <p style="margin:0 0 8px;font-size:17px;color:#333;">이 글이 도움이 되셨나요?</p>
      <p style="margin:0;font-size:15px;color:#666;">댓글로 여러분의 경험도 나눠주세요 ❤️</p>
    </div>`

  return `
    <article style="max-width:680px;margin:0 auto;padding:24px;font-family:'Pretendard Variable',sans-serif;">
      ${heroSection}
      ${metaBar}
      ${titleBlock}
      ${sectionsHtml}
      ${authorCard}
      ${ctaBlock}
    </article>`
}

/** AI 응답에서 섹션 파싱 */
export function parseSectionsFromAI(content: string): MagazineSection[] {
  const sections: MagazineSection[] = []
  const parts = content.split(/##\s+/)

  for (let i = 1; i < parts.length; i++) {
    const lines = parts[i].split('\n')
    const heading = lines[0].trim()
    const body = lines.slice(1).join('\n').trim()

    // 팁 박스 추출
    const tipMatch = body.match(/💡\s*꿀팁[:\s]*(.+?)(?=\n\n|$)/s)
    const quoteMatch = body.match(/"(.+?)"/s)

    let cleanBody = body
      .replace(/💡\s*꿀팁[:\s]*.+?(?=\n\n|$)/s, '')
      .replace(/\[IMAGE_PROMPT:\s*.+?\]/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()

    // Markdown -> HTML paragraphs
    cleanBody = cleanBody
      .split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')

    sections.push({
      heading,
      body: cleanBody,
      tipBox: tipMatch?.[1]?.trim(),
      quote: quoteMatch?.[1]?.trim(),
    })
  }

  // 섹션이 없으면 전체를 하나의 섹션으로
  if (sections.length === 0) {
    sections.push({
      heading: '',
      body: content.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''),
    })
  }

  return sections
}
