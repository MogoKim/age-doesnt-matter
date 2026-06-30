// 의존성 없는 미니 추이선 (inline SVG). admin KPI 카드/표용.
export default function Sparkline({
  values,
  width = 180,
  height = 36,
  color = '#FF6F61',
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  const pts = values.filter((v) => Number.isFinite(v))
  if (pts.length < 2) {
    return <svg width={width} height={height} aria-hidden />
  }
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const range = max - min || 1
  const pad = 3
  const x = (i: number) => (i / (pts.length - 1)) * (width - pad * 2) + pad
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lastX = x(pts.length - 1)
  const lastY = y(pts[pts.length - 1])
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden>
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  )
}
