'use client'

interface AdClickTrackerProps {
  adId: string
  children: React.ReactNode
}

export default function AdClickTracker({ adId, children }: AdClickTrackerProps) {
  function handleClick() {
    fetch('/api/ad-click', {
      method: 'POST',
      body: JSON.stringify({ adId }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})
  }

  return <div onClick={handleClick}>{children}</div>
}
