'use client'

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-h-[85vh] overflow-y-auto lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:max-w-[480px] lg:w-[calc(100%-4rem)]"
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border lg:hidden" />
        {title && <SheetTitle className="text-lg font-semibold mb-4">{title}</SheetTitle>}
        {children}
      </SheetContent>
    </Sheet>
  )
}
