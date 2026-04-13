'use client'

export default function FooterPwaButton() {
  return (
    <button
      onClick={() =>
        window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'manual' }))
      }
      className="text-caption text-muted-foreground hover:text-foreground transition-colors"
    >
      홈 화면에 추가
    </button>
  )
}
