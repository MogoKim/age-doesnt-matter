export default function AdInline() {
  return (
    <aside className="bg-[var(--surface-warm)] border-y border-border px-4 py-3 relative" role="complementary" aria-label="광고 영역">
      <span className="absolute top-2 right-3 text-[15px] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border border-border">광고</span>
      <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">광고 영역</div>
    </aside>
  )
}
