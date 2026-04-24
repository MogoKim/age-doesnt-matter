import Image from 'next/image'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  src?: string | null
  nickname: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
} as const

const IMAGE_SIZES = { sm: 32, md: 40, lg: 64 } as const

const COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-orange-100 text-orange-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-teal-100 text-teal-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
]

function getColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default function UserAvatar({ src, nickname, size = 'md', className }: UserAvatarProps) {
  const initial = nickname.charAt(0)
  const colorClass = getColorFromName(nickname)

  if (src) {
    return (
      <Image
        src={src}
        alt={nickname}
        width={IMAGE_SIZES[size]}
        height={IMAGE_SIZES[size]}
        className={cn('rounded-full object-cover', SIZES[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold shrink-0',
        SIZES[size],
        colorClass,
        className
      )}
      aria-label={nickname}
    >
      {initial}
    </div>
  )
}
